-- Очистити всі кімнати та game_states
-- Виконати в Supabase SQL Editor

-- Видалити всі game_states (cascade видалить автоматично якщо є ON DELETE CASCADE)
DELETE FROM game_states;

-- Видалити всі кімнати
DELETE FROM rooms;

-- Перевірити що все очищено
SELECT 'rooms' as table_name, COUNT(*) as count FROM rooms
UNION ALL
SELECT 'game_states' as table_name, COUNT(*) as count FROM game_states;
