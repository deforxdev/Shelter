-- Drop existing table if exists
DROP TABLE IF EXISTS game_states CASCADE;

-- Create game_states table
CREATE TABLE game_states (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    current_round INTEGER DEFAULT 1,
    current_turn INTEGER DEFAULT 0,
    phase TEXT DEFAULT 'speaking', -- speaking, voting, results
    bunker_slots INTEGER DEFAULT 3,
    players JSONB DEFAULT '[]'::jsonb,
    bunker_info JSONB DEFAULT '{}'::jsonb,
    turn_duration INTEGER DEFAULT 120, -- seconds
    vote_duration INTEGER DEFAULT 60, -- seconds
    turn_started_at TIMESTAMPTZ DEFAULT NOW(),
    votes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX idx_game_states_room_id ON game_states(room_id);

-- Enable RLS
ALTER TABLE game_states ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view game states" ON game_states;
DROP POLICY IF EXISTS "Anyone can create game states" ON game_states;
DROP POLICY IF EXISTS "Anyone can update game states" ON game_states;
DROP POLICY IF EXISTS "Anyone can delete game states" ON game_states;

-- Create policies
CREATE POLICY "Anyone can view game states" ON game_states
    FOR SELECT USING (true);

CREATE POLICY "Anyone can create game states" ON game_states
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update game states" ON game_states
    FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete game states" ON game_states
    FOR DELETE USING (true);

-- Enable realtime
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'game_states'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE game_states;
    END IF;
END $$;
