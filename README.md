# OneWord — setup guide

## 1. Edit one file
Open `config.js` and paste:
- `SUPABASE_URL`  → Supabase → Settings → API → Project URL
- `SUPABASE_ANON_KEY` → same page → anon public key
- `WHATSAPP_NUMBER` → your sales WhatsApp number (e.g. 919876543210)

## 2. Put the folder on GitHub
1. GitHub → **New repository** → name `oneword` → Create.
2. Click **uploading an existing file** → drag ALL files in this folder (index.html, admin.html, app.js, admin.js, style.css, config.js, logo.jpg) → **Commit changes**.

## 3. Connect Cloudflare Pages
1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick `oneword`.
2. Framework preset: **None**. Build command: leave empty. Output directory: `/`. Save and Deploy.
3. After it deploys, **Custom domains → Set up a custom domain → onewordlearning.com**. Cloudflare adds the DNS record automatically.

## 4. First login
- Go to onewordlearning.com, sign in with your admin ID (`admin`) and password.
- Tap **Admin** (top right) → add words or paste from Google Sheets.

## 5. Creating a user after a sale
Supabase → Authentication → Users → **Add user**
- Email: `userid@onewordlearning.com` (e.g. `sha001@onewordlearning.com`)
- Password: anything
- Tick **Auto Confirm User** → Create
Send the ID (`sha001`) and password to the customer. Their 365 days start today.

## 6. Updating the site later
Edit the file on GitHub (pencil icon) → Commit. Cloudflare republishes in about a minute.

## Google Sheet column order for bulk import
`day | word | meaning | malayalam | usage | example1 | example2 | example3 | quiz_question | option_a | option_b | option_c | option_d | correct`
(`correct` = a, b, c or d)
