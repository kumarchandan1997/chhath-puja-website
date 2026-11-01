# छठ पूजा समिति — साझा चंदा और सामग्री वेबसाइट

यह मोबाइल-फ्रेंडली हिंदी वेबसाइट GitHub Pages + Supabase के लिए बनाई गई है। दोनों सूचियों का डेटा और फोटो सभी डिवाइसों पर साझा होगा।

## वेबसाइट में क्या है?
- मुख्य पृष्ठ और शीर्ष 5 दानदाता
- चंदा सूची: नाम, मोबाइल, पता, राशि, टिप्पणी और फोटो
- सामग्री/खरीद सूची: सामग्री का नाम, संक्षिप्त/विस्तृत विवरण, फोटो, अग्रिम भुगतान, कुल रकम और बाकी रकम
- खोज, 10 रिकॉर्ड प्रति पेज pagination, JSON export
- छठ पूजा के अनुरूप केसरिया/सुनहरा रंग और responsive मोबाइल डिजाइन
- Supabase से रिकॉर्ड refresh; Realtime और 30 सेकंड polling fallback

## चरण 1 — Supabase तैयार करें
1. https://supabase.com पर अकाउंट बनाकर नया project बनाएँ।
2. Project के SQL Editor में `supabase-setup.sql` का पूरा SQL paste करके Run करें।
3. Project Settings / API (या Connect) में Project URL और publishable/anon public key प्राप्त करें।
4. `assets/js/config.js` खोलें और:
   - `SUPABASE_URL` में अपना Project URL डालें।
   - `SUPABASE_ANON_KEY` में publishable/anon key डालें।
5. `service_role` या secret key कभी भी वेबसाइट के JavaScript में न डालें।

## चरण 2 — वेबसाइट चलाकर देखें
- सभी फाइलें ZIP से निकालें।
- `index.html` को सीधे double-click करने की बजाय local server से चलाना बेहतर है।
- Python उपलब्ध हो तो project folder में terminal खोलकर चलाएँ:
  `python3 -m http.server 8000`
- ब्राउज़र में `http://localhost:8000` खोलें।
- Supabase credentials सही होने के बाद रिकॉर्ड जोड़कर जाँचें।

## चरण 3 — GitHub Pages पर मुफ्त publish करें
1. GitHub पर नया public repository बनाएँ।
2. ZIP से निकली फाइलें और folders repository की root में upload करें। `index.html` root में होना चाहिए।
3. Repository → Settings → Pages में Build and deployment को `Deploy from a branch` चुनें।
4. Branch `main`, folder `/ (root)` चुनकर Save करें।
5. GitHub Pages URL खुलने पर मोबाइल से भी टेस्ट करें।

## सार्वजनिक डेटा के बारे में महत्वपूर्ण
- इस demo setup में कोई भी visitor बिना login के रिकॉर्ड जोड़ सकता है और सार्वजनिक रिकॉर्ड/फोटो देख सकता है। यह आपकी माँग के अनुसार है, लेकिन कोई spam या गलत रिकॉर्ड भी जोड़ सकता है।
- रिकॉर्ड edit/delete करने का UI नहीं है। गलत रिकॉर्ड के लिए Supabase dashboard से अधिकृत admin द्वारा हटाना होगा।
- मोबाइल नंबर और पते सार्वजनिक दिख सकते हैं; केवल वही जानकारी डालें जिसे सार्वजनिक करना उचित हो।
- यह SQL public anonymous insert/upload सक्षम करता है। बड़े पैमाने पर सार्वजनिक उपयोग से पहले CAPTCHA, rate limit या admin approval जोड़ना उचित है।
- `chandanstore.json` और `chhath-materials.json` export के समय डाउनलोड होने वाली backup files हैं। GitHub Pages static site अपने आप repository में JSON file नहीं लिख सकती।
- Supabase Free projects inactivity के कारण pause हो सकते हैं; सुपाबेस dashboard में project status देखें।
- Images public हैं ताकि सभी visitors उन्हें देख सकें। Upload path में timestamp/UUID का इस्तेमाल होता है।

## फ़ोल्डर संरचना
- `index.html` — मुख्य पृष्ठ
- `chanda.html` — चंदा सूची
- `materials.html` — सामग्री/खरीद सूची
- `assets/css/style.css` — साझा theme और responsive styling
- `assets/js/config.js` — Supabase credentials
- `assets/js/common.js` — साझा helper functions
- `assets/js/home.js` — मुख्य पृष्ठ data
- `assets/js/chanda.js` — चंदा सूची logic
- `assets/js/materials.js` — सामग्री सूची logic
- `supabase-setup.sql` — database/storage permissions
