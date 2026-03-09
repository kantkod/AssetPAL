import fs from "fs";
import path from "path";

export function ensureDir(p){
  fs.mkdirSync(p, { recursive:true });
}
export function readJson(p){
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
export function writeJson(p, obj){
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}
export function writeText(p, txt){
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, txt);
}
export function nowStamp(){
  const d = new Date();
  const pad=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
