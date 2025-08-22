# Spotify Playlist → טבלת BPM/Key (לקוח דפדפן מלא)

אתר קטן שמאפשר להדביק קישור לפלייליסט בספוטיפיי, למשוך את רשימת הטראקים כולל **BPM** ו־**מפתח** (Key), ולייצא לקובץ **Excel**.

## מה מתקבל בטבלה
- **שם האומן** (Artists)
- **שם הטראק** (Track)
- **סוג שחרור**: אלבום / EP / סינגל / אוסף  
  > **הערת זיהוי EP**: בספוטיפיי אין טיפוס `EP` רשמי. נהגנו כך: אם `album_type = single` ובאלבום יש **יותר מטרק אחד** (`total_tracks > 1`) — נחשב **EP**. אם `album_type = single` ויש טראק אחד בלבד — **סינגל**. אם `album_type = album` — **אלבום**.
- **BPM** (מתוך `audio-features`)
- **מפתח** (Key) למשל: `A Minor` / `C# Major`.

## איך מריצים מקומית (Smoke)
1. פתחו טרמינל בתיקייה של הקבצים והפעילו שרת סטטי, לדוגמה:
   ```bash
   python3 -m http.server 8080
   ```
2. היכנסו ל־<http://localhost:8080/> בדפדפן (Chrome מומלץ).
3. ב־**Spotify Developer Dashboard** צרו אפליקציה, העתיקו את ה־**Client ID** והגדירו **Redirect URI** זהה לכתובת שממנה אתם מריצים (למשל `http://localhost:8080/`).  
4. מלאו את ה־Client ID ואת ה־Redirect URI בשדהי ההגדרות בעמוד, לחצו **שמירת הגדרות** ואז **התחברות עם ספוטיפיי**.
5. הדביקו קישור פלייליסט ולחצו **משיכה**. אחרי העיבוד תוכלו ללחוץ **הורדת Excel**.

## חוזה/Contract מינימלי
- קלט: קישור לפלייליסט בספוטיפיי (`open.spotify.com/playlist/...` או `spotify:playlist:...`).
- אוטנטיקציה: OAuth PKCE (ללא סוד). נדרש `playlist-read-private playlist-read-collaborative`.
- פלט: טבלת HTML + יצוא Excel עם העמודות: אמן | טראק | שחרור | BPM | מפתח.
- מגבלות: נדרש להריץ מה־HTTP/HTTPS (לא `file://`).

## תלות (Dependency Scan)
- **Frontend בלבד** (Vanilla JS, ללא בנדלר).
- ספרייה חיצונית: **SheetJS (xlsx)** מ־CDN: `https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js` לשם יצוא לקובץ Excel.
- שירות חיצוני: **Spotify Web API**.
  - `GET /v1/playlists/{id}/tracks` (פאג'ינציה עד 100 ל־page)
  - `GET /v1/audio-features?ids=...` (בצקים של עד 100 מזהים)
  - OAuth Token/Refresh ב־`https://accounts.spotify.com/api/token` (PKCE).

## Integrity Summary
- **קבצים מלאים**: `index.html`, `styles.css`, `app.js`, `README.md` — ללא קוד חלקי.
- **שמירת API קיים**: אין API חיצוני שנשבר, הכל לקוח־צד. לא בוצעו BREAKING changes ביחס לגרסה קודמת (זהו מסירה ראשונה).
- **Scope**: Slice יחיד — משיכת פלייליסט → טבלה → יצוא Excel.
- **טעויות/שגיאות**: טיפול בשגיאות API בסיסי + רפרוש טוקן. הצגת סטטוס התחברות.

## הערות יישום
- זיהוי EP נעשה היוריסטית (מוסבר למעלה).
- Key ממופה מערך `key (0-11)` ו־`mode` של ספוטיפיי ל־Major/Minor סטנדרטיים.
- BPM מעוגל למספר שלם.
