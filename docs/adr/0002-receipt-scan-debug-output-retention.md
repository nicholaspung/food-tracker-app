# Receipt scan debug output retention

Receipt images are transient and are not saved with Bills, but failed, invalid, or low-confidence **Receipt Scan** attempts may store raw Gemini output in an admin-only debug collection for 30 days. This keeps enough evidence to diagnose extraction quality and prompt/schema issues without retaining every successful high-confidence receipt scan or any receipt image files.
