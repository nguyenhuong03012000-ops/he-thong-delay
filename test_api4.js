const https = require('https');

https.get('https://docs.google.com/spreadsheets/d/1s_kiZmo0K4-xVoceA31Bk3YtZ_HiSygjM1D2EF6bjMc/gviz/tq?tqx=out:json&gid=1243266024', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        let jsonStr = data.replace(/^[^{]*/, "").replace(/[^}]*$/, "");
        let obj = JSON.parse(jsonStr);
        let count = 0;
        obj.table.rows.forEach(r => {
            let rowStr = Object.values(r.c || []).map(cell => cell ? cell.v : '').join(' | ');
            if (rowStr.includes('553319574') || rowStr.includes('535737514')) {
                console.log(rowStr);
                count++;
            }
        });
        console.log("Total matching rows:", count);
    });
});
