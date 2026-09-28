-- A tag colour is either a palette tone or any RGB colour as #RRGGBB (upper case). Existing tones stay valid.
ALTER TABLE app.tags DROP CONSTRAINT tags_tone_check;
ALTER TABLE app.tags ADD CONSTRAINT tags_tone_check CHECK(tone IN ('neutral','blue','purple','green','amber','red') OR tone ~ '^#[0-9A-F]{6}$');
