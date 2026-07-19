# Web2APK Studio Dashboard

واجهة GitHub Pages/PWA بلا CDN أو سكربتات أو خطوط خارجية. تتصل اختيارياً بمستودع `drewa8806-dot/web2apk-studio-builder` الخاص عبر GitHub REST API، وترفع الحزمة إلى Git Blobs ثم تستدعي المسار `POST /repos/drewa8806-dot/web2apk-studio-builder/dispatches`.

## التشغيل بلا إنترنت

- App Shell كامل مخزّن بواسطة Service Worker: HTML وCSS وJavaScript وSVG وManifest.
- Splash محلي مدته ثانيتان على الأقل، ثم تظهر الواجهة التفاعلية كاملة.
- الواجهة، المعاينات، اختيار ZIP، إعدادات الأيقونة وSplash، والأذونات تعمل محلياً.
- إذا بدأ المستخدم بناءً بلا إنترنت، تُخزن حزمة البناء كـ Blob داخل IndexedDB.
- عند عودة الاتصال، يُستعاد GitHub Token المحفوظ اختيارياً وتُرسل العمليات المؤجلة تلقائياً.
- تجميع APK الحقيقي يتم في GitHub Actions، ولذلك ينتظر الاتصال؛ لا تدّعي الواجهة أن Android toolchain يعمل داخل المتصفح.

## الأمان

- لا يوجد Token ثابت داخل الكود أو GitHub Pages.
- يمكن حفظ Fine-grained PAT اختيارياً في `LocalStorage` على جهاز المستخدم.
- استخدم الحفظ على جهاز شخصي فقط؛ أي JavaScript يعمل على نفس النطاق يستطيع تقنياً قراءة LocalStorage.
- توجد سياسة CSP ولا تعتمد الواجهة على أي مكتبات خارجية.
- اجعل Token محدوداً بمستودع الـBuilder وحده مع:
  - Contents: Read and write
  - Actions: Read and write
- زر قطع الاتصال يحذف المفتاح المحفوظ.

## التنزيل

روابط APK وAAB تستخدم `browser_download_url` مباشرة، بحيث تدخل الملفات إلى قائمة تنزيلات المتصفح دون تنفيذ `fetch` إلى `api.github.com` عند الضغط.
