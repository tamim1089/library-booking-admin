const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

function verifyToken(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('No token provided');
    }
    const token = authHeader.substring(7);
    try {
        return jwt.verify(token, process.env.JWT_SECRET || 'default-secret-change-in-production');
    } catch (error) {
        throw new Error('Invalid token');
    }
}

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ message: 'Method not allowed' }),
        };
    }

    try {
        const adminUser = verifyToken(event.headers.authorization);
        const { request_id } = JSON.parse(event.body);

        if (!request_id) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ message: 'request_id is required' }),
            };
        }

        // Get the booking request
        const { data: request, error: requestError } = await supabase
            .from('booking_requests')
            .select('*')
            .eq('id', request_id)
            .eq('status', 'pending')
            .single();

        if (requestError || !request) {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({ message: 'Request not found or already processed' }),
            };
        }

        // Check for conflicts with existing bookings
        const { data: conflicts, error: conflictError } = await supabase
            .from('bookings')
            .select('id')
            .eq('room_id', request.room_id)
            .or(`and(start_time.lte.${request.end_time},end_time.gte.${request.start_time})`);

        if (conflictError) throw conflictError;

        if (conflicts && conflicts.length > 0) {
            // Update request to rejected due to conflict
            await supabase
                .from('booking_requests')
                .update({ status: 'rejected' })
                .eq('id', request_id);

            return {
                statusCode: 409,
                headers,
                body: JSON.stringify({
                    message: 'Booking conflict detected. Request has been rejected.',
                }),
            };
        }

        // Create the approved booking
        const { error: bookingError } = await supabase
            .from('bookings')
            .insert({
                student_id: request.student_id,
                room_id: request.room_id,
                start_time: request.start_time,
                end_time: request.end_time,
            });

        if (bookingError) throw bookingError;

        // Update request status to approved
        const { error: updateError } = await supabase
            .from('booking_requests')
            .update({ status: 'approved' })
            .eq('id', request_id);

        if (updateError) throw updateError;

        // Log admin action (non-blocking - don't fail if audit log fails)
        try {
            await supabase
                .from('audit_logs')
                .insert({
                    admin_username: adminUser.username,
                    action: 'approve_booking',
                    related_request_id: request_id,
                });
        } catch (auditError) {
            console.error('Audit log error (non-critical):', auditError);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                message: 'Booking approved successfully',
            }),
        };

    } catch (error) {
        console.error('Error in approveBooking:', error);

        if (error.message === 'No token provided' || error.message === 'Invalid token') {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ message: 'Unauthorized' }),
            };
        }

        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                message: 'Failed to approve booking',
                error: error.message,
            }),
        };
    }
};
