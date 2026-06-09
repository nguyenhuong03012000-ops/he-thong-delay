const fs = require('fs');

let html = fs.readFileSync('index_v2.html', 'utf8');
const appJs = fs.readFileSync('app_v2.js', 'utf8');
const delayJs = fs.readFileSync('delay_v27.js', 'utf8');

// Remove original external script imports
html = html.replace(/<script src="app_v2\.js[^>]*><\/script>/, '');
html = html.replace(/<script src="delay_v27\.js[^>]*><\/script>/, '');

// Build inline script block
const inlineScripts = `
<!-- ============================================== -->
<!-- HỆ THỐNG APP_V2 NỘI BỘ (Chạy độc lập không cần file ngoài) -->
<!-- ============================================== -->
<script>
${appJs}
</script>

<!-- ============================================== -->
<!-- HỆ THỐNG DELAY_V27 NỘI BỘ (Chạy độc lập không cần file ngoài) -->
<!-- ============================================== -->
<script>
${delayJs}
</script>
`;

// Inject right before </body>
html = html.replace('</body>', inlineScripts + '\n</body>');

// Save the standalone file
fs.writeFileSync('Bao_Cao_Delay_Doc_Lap.html', html);
console.log('Successfully created Bao_Cao_Delay_Doc_Lap.html');
