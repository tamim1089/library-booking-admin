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
            .select('id')
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

        // Update request status to rejected
        const { error: updateError } = await supabase
            .from('booking_requests')
            .update({ status: 'rejected' })
            .eq('id', request_id);

        if (updateError) throw updateError;

        // Log admin action
        await supabase
            .from('audit_logs')
            .insert({
                admin_username: adminUser.username,
                action: 'reject_booking',
                related_request_id: request_id,
            })
            .catch(err => console.error('Audit log error:', err));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                message: 'Booking rejected successfully',
            }),
        };

    } catch (error) {
        console.error('Error in rejectBooking:', error);

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
                message: 'Failed to reject booking',
                error: error.message,
            }),
        };
    }
};
