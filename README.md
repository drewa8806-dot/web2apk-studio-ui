# Web2APK Studio Dashboard

واجهة GitHub Pages عامة بلا أسرار. تتصل مباشرة بمستودع `drewa8806-dot/web2apk-studio-builder` الخاص عبر GitHub REST API، وترفع الحزمة إلى Git Blobs ثم تستدعي المسار الدقيق `POST /repos/drewa8806-dot/web2apk-studio-builder/dispatches`.

## الأمان

- لا يوجد Token في الكود أو GitHub Pages.
- يطلب الموقع Fine-grained PAT عند كل جلسة، ويحفظه في ذاكرة الصفحة فقط.
- اجعل Token محدوداً بمستودع الـBuilder وحده مع:
  - Contents: Read and write
  - Actions: Read and write
- أغلق الصفحة لإزالة Token من الذاكرة.

يستبدل Workflow القيمة `__GITHUB_OWNER__` تلقائياً عند نشر Pages.
