-- The users seen in the last 24 hours, most recent first, each row carrying how many there are (1.50).
SELECT email, name, datetime(last_seen / 1000, 'unixepoch') AS last_seen_utc, COUNT(*) OVER () AS total
FROM users WHERE last_seen > (unixepoch() - 86400) * 1000 ORDER BY last_seen DESC;
