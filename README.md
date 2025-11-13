# Thrive QR Chatbot

Next.js + Tailwind + TypeScript ile karşılama ve sohbet akışı.

## Özellikler

- İlk açılışta karşılama ekranı: ad ve e-posta
- Aynı telefonda aynı link tekrar açılırsa karşılama adımı otomatik atlanır (localStorage ile)
- Tarayıcıdan konum izni (HTTPS altında) isteği ve oturuma kaydetme
- Renk paletine uygun sohbet arayüzü

## Renk Paleti

- Primary: Pink-Red `#E9426C`
- Accent: Purple-Magenta `#BC358B`
- Dark: `#191919`
- Light: `#FAFAFA`
- Secondary: Navy `#2A4E7B`, Indigo `#4D519E`, Violet `#8C4E99`, Cyan `#3B92B3`, Light Sky `#64C6E6`

## Geliştirme

```bash
pnpm install # veya npm install / yarn
pnpm dev     # http://localhost:3000
```

## Çalışma Prensibi

- Aynı telefon + aynı link kontrolü: `localStorage` anahtarı, mevcut URL (pathname + query) temel alınarak üretilir.
- Oturum verisi: `name`, `email`, `createdAt`, opsiyonel `location`.
- Konum izni: HTTPS altında kullanıcıdan istenir; reddedilirse sohbet yine çalışır.

## İlham

Arayüz yapısı ve stil için referans: [AI Chat Bundle](https://cdn.21st.dev/beratberkayg/ai-chat/default/bundle.1756670053130.html?theme=dark).
