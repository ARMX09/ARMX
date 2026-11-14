# ARMX — CODEWAY

منصة تعليم البرمجة وريادة الأعمال للأطفال، مع ربط بـ **Kling AI** لإنشاء فيديوهات وصور تعليمية بالذكاء الاصطناعي.

## التشغيل

1. أنشئ مفاتيح API من لوحة مطوري Kling AI (Access Key و Secret Key).
2. انسخ ملف الإعدادات واملأ المفاتيح:
   ```bash
   cp .env.example .env
   ```
3. شغّل الخادم (Node.js 18 أو أحدث، بدون أي حزم إضافية):
   ```bash
   npm start
   ```
4. افتح http://localhost:3000

## الميزات

| الميزة | مسار الخادم | مسار Kling |
|---|---|---|
| نص ← فيديو | `POST /api/kling/text2video` | `/v1/videos/text2video` |
| صورة ← فيديو | `POST /api/kling/image2video` | `/v1/videos/image2video` |
| نص ← صورة | `POST /api/kling/image` | `/v1/images/generations` |
| حالة المهمة | `GET /api/kling/<النوع>/<task_id>` | `GET .../<task_id>` |

المفاتيح السرية تبقى على الخادم فقط؛ الخادم يوقّع كل طلب بـ JWT (HS256) صالح لمدة 30 دقيقة.
