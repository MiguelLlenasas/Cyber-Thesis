const fs = require('fs');
const path = require('path');

const engData = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, 'words_dictionary.json'),
        'utf-8'
    )
);

const englishWords = Object.keys(engData);
const tagData = JSON.parse(
    fs.readFileSync(
        path.join(__dirname, 'tagalog_dictionary.json'),
        'utf-8'
    )
);

const tagalogWords = tagData.map(entry => entry.word.toLowerCase());

// ===== COMBINE BOTH =====
const dictionaryWords = [
    ...englishWords,
    ...tagalogWords
];

// 🌟 SOLUSYON SA ERROR: Gumawa ng listahan ng mga salitang may length na 8 o pataas
const longDictionaryWords = dictionaryWords.filter(word => word.length >= 8);

const symbols = ['!', '@', '#', '$', '%', '&', '*'];
const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const digits = '0123456789';

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randChar(str) {
  return str[Math.floor(Math.random() * str.length)];
}

function randomString(length) {
  let out = '';
  const all = letters + digits + '!@#$%&*';
  for (let i = 0; i < length; i++) {
    out += randChar(all);
  }
  return out;
}

function hasSequence(str) {
  return /(123|abc|234|bcd|qwe)/i.test(str) ? 1 : 0;
}

function hasLeet(str) {
  return /[@$]/.test(str) ? 1 : 0;
}

function hasSymbol(str) {
  return /[!@#$%&*]/.test(str) ? 1 : 0;
}

function buildFeatures(password, label, isDictionary) {
  // Piliting maging lowercase kung DICTIONARY para walang maling upper-case flag
  const cleanPassword = (label === 'DICTIONARY') ? password.toLowerCase() : password;

  return {
    password_sample: cleanPassword,
    f_length: cleanPassword.length >= 8 ? 1 : 0, 
    f_dict: isDictionary,
    f_leet: hasLeet(cleanPassword),
    f_num: /\d/.test(cleanPassword) ? 1 : 0,
    f_sym: hasSymbol(cleanPassword),
    f_seq: hasSequence(cleanPassword),
    // 🌟 INAYOS ANG ORDER: Nilagay dito para sumakto sa CSV text formatting mo sa ibaba
    f_numeric_suffix: /\d{2,}$/.test(cleanPassword) ? 1 : 0,
    f_rule_pattern: (
        hasLeet(cleanPassword) ||
        /\d{2,}$/.test(cleanPassword) ||
        hasSequence(cleanPassword)
    ) ? 1 : 0,
    label: label 
  };
}

const rows = [];

// SHORT DICTIONARY
for (let i = 0; i < 100; i++) {
    rows.push(
        buildFeatures(
            rand(dictionaryWords),
            "DICTIONARY",
            1
        )
    );
}

// LONG DICTIONARY
for (let i = 0; i < 100; i++) {
    rows.push(
        buildFeatures(
            rand(longDictionaryWords),
            "DICTIONARY",
            1
        )
    );
}

// ===== RULE-BASED =====
for (let i = 0; i < 200; i++) {
  const word = rand(dictionaryWords);
  const variants = [
    word + rand(['12', '123', '2024', '99']),
    word.charAt(0).toUpperCase() + word.slice(1) + rand(symbols),
    word.replace(/a/g, '@').replace(/o/g, '0') + rand(['1', '22']),
    rand(symbols) + word + rand(['123', '99'])
  ];

  const pass = rand(variants);
  rows.push(
    buildFeatures(pass, 'RULE-BASED', 1)
  );
}

// ===== BRUTE-FORCE =====
for (let i = 0; i < 200; i++) {
  const pass = randomString(10 + Math.floor(Math.random() * 5));
  rows.push(
    buildFeatures(pass, 'BRUTE-FORCE', 0)
  );
}

// ===== CSV CREATION =====
let csv = 'password_sample,f_length,f_dict,f_leet,f_num,f_sym,f_seq,f_numeric_suffix,f_rule_pattern,label\n';
rows.forEach(r => {
  csv += `${r.password_sample},${r.f_length},${r.f_dict},${r.f_leet},${r.f_num},${r.f_sym},${r.f_seq},${r.f_numeric_suffix},${r.f_rule_pattern},${r.label}\n`;
});

fs.writeFileSync('additional_dataset.csv', csv);

console.log('✅ additional_dataset.csv generated successfully!');
console.log(`✅ Total generated samples: ${rows.length}`);