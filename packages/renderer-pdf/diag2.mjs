import { readFileSync } from "fs";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
const buf1 = readFileSync("/tmp/out1.pdf");
const buf2 = readFileSync("/tmp/out2.pdf");
const r1 = await pdfParse(buf1);
console.log("parse1 ok, pages=", r1.numpages);
const r2 = await pdfParse(buf2);
console.log("parse2 ok, pages=", r2.numpages);
