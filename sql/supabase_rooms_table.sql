-- Створення таблиці rooms для системи лобі
-- Виконайте цей SQL в Supabase SQL Editor

-- УВАГА: Це видалить всі існуючі кімнати!
-- Крок 0: Видалити стару таблицю якщо існує
DROP TABLE IF EXISTS rooms CASCADE;

-- Крок 1: Створити таблицю
CREATE TABLE rooms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    max_players INTEGER DEFAULT 6,
    is_private BOOLEAN DEFAULT FALSE,
    password VARCHAR(255),
    host_id UUID REFERENCES auth.users(id),
    status VARCHAR(50) DEFAULT 'waiting',
    players JSONB DEFAULT '[]'::jsonb,
    turn_duration INTEGER DEFAULT 120,
    vote_duration INTEGER DEFAULT 60,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Крок 2: Включити RLS (Row Level Security)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- Крок 3: Політики безпеки

-- Всі можуть читати кімнати
DROP POLICY IF EXISTS "Anyone can read rooms" ON rooms;
CREATE POLICY "Anyone can read rooms" ON rooms
    FOR SELECT USING (true);

-- Аутентифіковані користувачі можуть створювати кімнати
DROP POLICY IF EXISTS "Authenticated users can create rooms" ON rooms;
CREATE POLICY "Authenticated users can create rooms" ON rooms
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Аутентифіковані користувачі можуть оновлювати кімнати
DROP POLICY IF EXISTS "Authenticated users can update rooms" ON rooms;
CREATE POLICY "Authenticated users can update rooms" ON rooms
    FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Хост може видаляти свою кімнату, або будь-хто може видаляти порожні кімнати
DROP POLICY IF EXISTS "Host can delete room" ON rooms;
CREATE POLICY "Host can delete room" ON rooms
    FOR DELETE USING (auth.uid() = host_id OR jsonb_array_length(players) = 0);

-- Крок 4: Включити realtime для таблиці (пропустити якщо вже додано)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'rooms'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
    END IF;
END $$;

-- Крок 5: Індекси для швидкості
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_created_at ON rooms(created_at);

-- Крок 6: Тригер для оновлення updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_rooms_updated_at ON rooms;
CREATE TRIGGER update_rooms_updated_at
    BEFORE UPDATE ON rooms
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
