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
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ message: 'Method not allowed' }),
        };
    }

    try {
        verifyToken(event.headers.authorization);

        // Get pending requests with room names
        const { data: requests, error } = await supabase
            .from('booking_requests')
            .select(`
                id,
                student_id,
                room_id,
                start_time,
                end_time,
                created_at,
                rooms (name)
            `)
            .eq('status', 'pending')
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Format the response
        const formattedRequests = requests.map(request => {
            const startTime = new Date(request.start_time);
            const endTime = new Date(request.end_time);
            const durationMinutes = Math.round((endTime - startTime) / 60000);

            return {
                id: request.id,
                student_id: request.student_id,
                room_id: request.room_id,
                room_name: request.rooms.name,
                start_time: request.start_time,
                end_time: request.end_time,
                duration: durationMinutes,
                created_at: request.created_at,
            };
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(formattedRequests),
        };

    } catch (error) {
        console.error('Error in getPendingRequests:', error);

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
                message: 'Failed to fetch pending requests',
                error: error.message,
            }),
        };
    }
};
