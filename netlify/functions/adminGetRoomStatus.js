const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Verify JWT token
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
        // Verify authentication
        verifyToken(event.headers.authorization);

        const now = new Date().toISOString();

        // Get all rooms
        const { data: rooms, error: roomsError } = await supabase
            .from('rooms')
            .select('id, name, access_group, is_active')
            .eq('is_active', true)
            .order('id');

        if (roomsError) throw roomsError;

        // Get current active bookings
        const { data: activeBookings, error: bookingsError } = await supabase
            .from('bookings')
            .select('room_id, student_id, start_time, end_time')
            .gte('end_time', now)
            .lte('start_time', now);

        if (bookingsError) throw bookingsError;

        // Create a map of room bookings
        const bookingMap = {};
        activeBookings.forEach(booking => {
            bookingMap[booking.room_id] = booking;
        });

        // Combine room data with booking info
        const roomsWithStatus = rooms.map(room => ({
            id: room.id,
            name: room.name,
            current_booking: bookingMap[room.id] || null,
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(roomsWithStatus),
        };

    } catch (error) {
        console.error('Error in getRoomStatus:', error);

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
                message: 'Failed to fetch room status',
                error: error.message,
            }),
        };
    }
};