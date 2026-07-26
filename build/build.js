const fs = require("fs"); const path = require("path"); const dist = path.join(__dirname, "../dist"); if (!fs.existsSync(dist)) fs.mkdirSync(dist, {recursive: true}); console.log("Building...");
