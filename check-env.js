const fs = require("fs");
const dotenv = require("dotenv");

const d = dotenv.parse(fs.readFileSync(".env"));

console.log("SESSION_SECRET:", Boolean(d.SESSION_SECRET));
console.log("DATABASE_URL:", Boolean(d.DATABASE_URL));

if (d.DATABASE_URL) {
    const url = new URL(d.DATABASE_URL);
    console.log("Neon hostname:", url.hostname);
}
