# Web2APK Studio Dashboard

واجهة GitHub Pages عامة بلا أسرار مضمّنة. تتصل مباشرة بمستودع `drewa8806-dot/web2apk-studio-builder` الخاص عبر GitHub REST API، وترفع الحزمة إلى Git Blobs ثم تستدعي المسار الدقيق `POST /repos/drewa8806-dot/web2apk-studio-builder/dispatches`.

## الأمان

- لا يوجد Token ثابت داخل الكود أو GitHub Pages.
- يمكن حفظ Fine-grained PAT اختيارياً في `LocalStorage` على جهاز المستخدم لتسجيل الدخول تلقائياً.
- استخدم الحفظ على جهاز شخصي فقط؛ أي JavaScript يعمل على نفس نطاق Pages يستطيع تقنياً قراءة LocalStorage.
- توجد سياسة CSP ولا تعتمد الواجهة على أي مكتبات أو سكربتات خارجية.
- اجعل Token محدوداً بمستودع الـBuilder وحده مع:
  - Contents: Read and write
  - Actions: Read and write
- زر قطع الاتصال يحذف المفتاح المحفوظ من المتصفح.

## التنزيل

روابط APK وAAB تستخدم `browser_download_url` مباشرة، بحيث تدخل الملفات إلى قائمة تنزيلات المتصفح دون تنفيذ `fetch` إلى `api.github.com` عند الضغط.
