const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const { DecisionTreeClassifier } = require("ml-cart");
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());


// ===== LOAD ML MODEL =====
const model = JSON.parse(
    fs.readFileSync(path.join(__dirname, "model.json"))
);

const classifier = DecisionTreeClassifier.load(model);

console.log("✅ ML model loaded");

// ===== LOAD DATASET =====
let trainingDataset = [];
const datasetPath = path.join(__dirname, 'dataset.csv');

// ===== LOAD DICTIONARIES =====
let englishSet = new Set();
let tagalogSet = new Set();

try {
    const engData = JSON.parse(
        fs.readFileSync(
            path.join(__dirname, 'words_dictionary.json'),
            'utf-8'
        )
    );

    englishSet = new Set(
        Object.keys(engData).map(word => word.toLowerCase())
    );

    console.log(
        `✅ English dictionary loaded: ${englishSet.size} words`
    );

} catch (err) {
    console.log("❌ Failed to load English dictionary");
}

try {
    const tagData = JSON.parse(
        fs.readFileSync(
            path.join(__dirname, 'tagalog_dictionary.json'),
            'utf-8'
        )
    );

    tagalogSet = new Set(
        tagData.map(entry => entry.word.toLowerCase())
    );

    console.log(
        `✅ Tagalog dictionary loaded: ${tagalogSet.size} words`
    );

} catch (err) {
    console.log("❌ Failed to load Tagalog dictionary");
}

// ===== LOAD CSV DATASET =====
fs.createReadStream(datasetPath)
    .pipe(csv())
    .on('data', (row) => trainingDataset.push(row))
    .on('end', () => {
        console.log(
            `✅ Dataset loaded: ${trainingDataset.length} samples ready for reference.`
        );
    })
    .on('error', () => {
        console.error("❌ Warning: dataset.csv not found.");
    });

// ===== 1. FEATURE EXTRACTION =====
function extractFeatures(password) {
    const originalPassword = password;
    const leetNormalized = originalPassword
        .toLowerCase()
        .replace(/@/g, 'a')
        .replace(/4/g, 'a')
        .replace(/0/g, 'o')
        .replace(/\$/g, 's')
        .replace(/5/g, 's')
        .replace(/3/g, 'e')
        .replace(/1/g, 'i')
        .replace(/!/g, 'i');

    // ===== DICTIONARY DETECTION WITH RATIO SAFETY GUARD =====
    let dictionaryDetected = 0;

    // 1. FAST: Exact match (Laging 100% tama)
    if (englishSet.has(leetNormalized) || tagalogSet.has(leetNormalized)) {
        dictionaryDetected = 1;
    } else {
        // 2. CONTROLLED substring check na may density threshold
        let longestMatchLength = 0;

        for (let word of englishSet) {
            if (word.length >= 4 && leetNormalized.includes(word)) {
                if (word.length > longestMatchLength) {
                    longestMatchLength = word.length;
                }
            }
        }
        
        if (longestMatchLength === 0) {
            for (let word of tagalogSet) {
                if (word.length >= 4 && leetNormalized.includes(word)) {
                    if (word.length > longestMatchLength) {
                        longestMatchLength = word.length;
                    }
                }
            }
        }

        // Sinasala ang mga accidental 4-letter matches sa loob ng mahahabang random strings
        if (longestMatchLength >= 4) {
            const wordRatio = longestMatchLength / originalPassword.length;
            
            if (wordRatio >= 0.35 || longestMatchLength >= 6) {
                dictionaryDetected = 1;
            }
        }
    }

    const hasLeetspeak = /[@$40531!]/.test(originalPassword) && dictionaryDetected;
    const extractedFeatures = {
        length: originalPassword.length,
        has_lowercase: /[a-z]/.test(originalPassword) ? 1 : 0,
        has_uppercase: /[A-Z]/.test(originalPassword) ? 1 : 0,
        has_digit: /\d/.test(originalPassword) ? 1 : 0,
        has_symbol: /[^A-Za-z0-9]/.test(originalPassword) ? 1 : 0,
        dictionary_present: dictionaryDetected,
        has_leetspeak: hasLeetspeak ? 1 : 0,
        numeric_suffix: (dictionaryDetected && /\d{2,}$/.test(originalPassword)) ? 1 : 0,
        has_sequence: /(abc|123|bcd|234)/i.test(originalPassword) ? 1 : 0,
        has_repetition: /(.)\1{2,}/.test(originalPassword) ? 1 : 0,
    };

    extractedFeatures.character_class_count =
        extractedFeatures.has_lowercase +
        extractedFeatures.has_uppercase +
        extractedFeatures.has_digit +
        extractedFeatures.has_symbol;

    extractedFeatures.rule_pattern_present = (
        extractedFeatures.has_sequence ||
        extractedFeatures.has_repetition ||
        (extractedFeatures.numeric_suffix && extractedFeatures.dictionary_present) ||
        (extractedFeatures.has_leetspeak && extractedFeatures.dictionary_present)
    ) ? 1 : 0;

    return extractedFeatures;
}

// ===== 2. PASSWORD CLASSIFICATION =====
function classifyPassword(extractedFeatures) {
    // 1. PURE DICTIONARY OVERRIDE (Shortcut bago mag-ML - mas pinahigpit)
    if (
        extractedFeatures.dictionary_present &&
        !extractedFeatures.has_uppercase && // ◄ DAPAT WALANG UPPERCASE para masabing pure dictionary word
        !extractedFeatures.has_digit &&
        !extractedFeatures.has_symbol &&
        !extractedFeatures.has_leetspeak &&
        !extractedFeatures.numeric_suffix
    ) {
        return {
            label: "DICTIONARY",
            path: [
                "Pure lowercase dictionary word detected",
                "Prediction overridden to DICTIONARY"
            ]
        };
    }

    // 2. PREPARE FEATURES FOR ML MODEL (Dito na dadaan sina helloWorld at GGwhfjete)
    const modelFeatures = [[
        extractedFeatures.length >= 8 ? 1 : 0,  // f_length
        extractedFeatures.dictionary_present,   // f_dict
        extractedFeatures.has_leetspeak,        // f_leet
        extractedFeatures.has_digit,            // f_num
        extractedFeatures.has_symbol,           // f_sym
        extractedFeatures.has_sequence,         // f_seq
        extractedFeatures.numeric_suffix,       // f_numeric_suffix
        extractedFeatures.rule_pattern_present  // f_rule_pattern
    ]];

    console.log("MODEL FEATURES:", modelFeatures);

    // 3. RUN MACHINE LEARNING PREDICTION
    const prediction = classifier.predict(modelFeatures);
    console.log("RAW PREDICTION:", prediction);

    const labelMap = {
        0: "DICTIONARY",
        1: "RULE-BASED",
        2: "BRUTE-FORCE"
    };

    let finalLabel = labelMap[prediction[0]];
    let finalPath = [
        "Machine Learning model analyzed the password features",
        `Prediction: ${finalLabel}`
    ];

    // 4. POST-ML FALLBACK
    if (finalLabel === "DICTIONARY" && extractedFeatures.rule_pattern_present === 1) {
        finalLabel = "RULE-BASED";
        finalPath.push("Post-Machine Learning Fallback: Corrected to RULE-BASED due to active rule patterns.");
    }

    return {
        label: finalLabel,
        path: finalPath
    };
}


// ===== 3. DYNAMIC REALISTIC SECURITY STRATEGIES & BREAKDOWN =====
function getStrategies(vulnerabilityType, extractedFeatures, password) {
    let tips = [];
    let technicalBreakdown = {
        vulnerability_explanation: "",
        attack_vector: "",
        remediation: ""
    };
    
    const currentPassword = password;

    // Base Rules for UI feedback (Dynamic placeholders based on user input)
    if (currentPassword.length < 12) {
        tips.push(`⚠️ Length Deficit: Your current length of ${currentPassword.length} characters is below the recommended 12-character cybersecurity standard.`);
    }
    if (extractedFeatures.character_class_count < 3) {
        tips.push(`⚠️ Character Diversity: You are only using ${extractedFeatures.character_class_count} character classes. Try blending upper, lower, digits, and symbols.`);
    }

    // Dynamic Sample Generation for shuffling strategy
    const halfLength = Math.ceil(currentPassword.length / 2);
    const shuffledSample = currentPassword.substring(halfLength) + currentPassword.substring(0, halfLength);

    // Dynamic Breakdown base sa Category
    if (vulnerabilityType === "DICTIONARY") {
        technicalBreakdown.vulnerability_explanation = 
            `The password '${currentPassword}' consists entirely of a standard dictionary word found in the database without sufficient complexity additions.`;
        technicalBreakdown.attack_vector = 
            `Highly vulnerable to Standard Dictionary Attacks using pre-compiled wordlists (e.g., RockYou) via automated cracking tools. Cracking time for '${currentPassword}': Less than 1 second.`;
        technicalBreakdown.remediation = 
            `Transition from the single word '${currentPassword}' to the 'Passphrase Method' by combining 3 to 4 random, unrelated words.`;

        tips.push(`🚨 Critical Warning: Avoid using raw, recognizable words like '${currentPassword}' as your password base.`);
        tips.push(`💡 Recommendation: Transform it into a Passphrase. Instead of '${currentPassword}', use something expanded like '${currentPassword}SapatosKapeHalimaw' to scale up security complexity.`);
    } 
    
    else if (vulnerabilityType === "RULE-BASED") {
        technicalBreakdown.vulnerability_explanation = 
            `The password '${currentPassword}' relies on a dictionary word foundation but attempts obfuscation using common, predictable human-created rules.`;
        technicalBreakdown.attack_vector = 
            `Vulnerable to Hybrid/Rule-Based Attacks (e.g., Hashcat rules engine). Modern GPU cracking setups automatically anticipate variations applied to '${currentPassword}' like trailing digits or leetspeak substitutions.`;
        technicalBreakdown.remediation = 
            `Disrupt predictable character positioning. Inject symbols and numbers unexpectedly into the middle of the string.`;

        if (extractedFeatures.has_leetspeak) {
            tips.push(`🔄 Leetspeak Exploitation: The character substitutions detected in '${currentPassword}' are fully mapped out by modern automated attack engines.`);
        }
        if (extractedFeatures.numeric_suffix) {
            tips.push(`🔢 Numeric Suffix Pattern: Appending numbers or years at the very end of '${currentPassword}' is a highly predictable human pattern that tools crack first.`);
        }
        if (/^[A-Z][a-z]+/.test(currentPassword)) {
            tips.push(`🔠 Title Case Bias: Capitalizing only the first letter of '${currentPassword}' follows standard linguistic habits. Try scattering uppercase letters dynamically.`);
        }
        tips.push(`💡 Strategy: Implement structural randomization. Instead of your current linear pattern '${currentPassword}', try shuffling or breaking the structure into something like '${shuffledSample}'.`);
    } 
    
    else if (vulnerabilityType === "BRUTE-FORCE") {
        technicalBreakdown.vulnerability_explanation = 
            `The password '${currentPassword}' shows no reliance on dictionary strings or traditional human habits. Security depends strictly on its combinatorial character space.`;
        technicalBreakdown.attack_vector = 
            `Targeted by Combinatorial/Exhaustive Brute-Force Attacks, where a computer systematically checks every mathematical combination until it hits '${currentPassword}'.`;
        technicalBreakdown.remediation = 
            `Increase overall password length to push the mathematical search space beyond realistic computing capabilities.`;

        if (currentPassword.length < 12) {
            tips.push(`❌ Attack Hazard: Although random, a length of ${currentPassword.length} characters for '${currentPassword}' can still be exhausted by modern GPU cluster arrays in a relatively short timeframe.`);
            tips.push(`💡 Action Required: Lengthen this random base. Every single character added to '${currentPassword}' multiplies the computational search difficulty exponentially.`);
        } else {
            tips.push(`⭐ High Complexity: The password '${currentPassword}' demonstrates excellent entropy and high computational resistance against automated guessing.`);
        }
        tips.push(`🛡️ Hybrid Defense: Pair high-entropy strings like '${currentPassword}' with Multi-Factor Authentication (MFA) to fully mitigate credential hazards.`);
    }

    // Extra structural alerts
    if (extractedFeatures.has_sequence) {
        tips.push(`🚫 Sequence Alert: The sequential layout found inside '${currentPassword}' drastically shortens the cracking algorithm search paths.`);
    }
    if (extractedFeatures.has_repetition) {
        tips.push(`🔁 Repetition Alert: Consecutive identical characters in '${currentPassword}' reduce mathematical entropy.`);
    }
    if (/^[^A-Za-z0-9]/.test(currentPassword) || /[^A-Za-z0-9]$/.test(currentPassword)) {
        tips.push(`📌 Placement Bias: Placing symbols strictly at the absolute start or end of '${currentPassword}' follows predictable human creation habits.`);
    }

    return { tips, technicalBreakdown };
}


// ===== 4. DYNAMIC DECISION TREE VISUAL TRACE PATH =====
function generateVisualTreePath(vulnerabilityType, extractedFeatures, password) {
    const isDict = extractedFeatures.dictionary_present === 1;
    const isRule = extractedFeatures.rule_pattern_present === 1;
    const isLeet = extractedFeatures.has_leetspeak === 1;
    const isSuffix = extractedFeatures.numeric_suffix === 1;
    const hasSeq = extractedFeatures.has_sequence === 1;
    const hasRep = extractedFeatures.has_repetition === 1;
    const hasDig = extractedFeatures.has_digit === 1;
    
    // Check common capitalization habit (Starts with uppercase followed by lowercase letters)
    const isCommonCap = /^[A-Z][a-z]+/.test(password);
    // Check general symbol affix habits at start/end
    const isSymAffix = /^[^A-Za-z0-9]/.test(password) || /[^A-Za-z0-9]$/.test(password);

    let visualTree = "START TREE\n";
    visualTree += "Node 1: Dictionary present?\n";

    if (isDict) {
        visualTree += " ├─ Yes → [MATCHED]\n";
        visualTree += " │   Node 2: Has leetspeak?\n";
        
        if (isLeet) {
            visualTree += " │    ├─ Yes → [MATCHED]\n";
            visualTree += " │    │   Node 3: Common capitalization?\n";
            
            if (isCommonCap) {
                visualTree += " │    │    ├─ Yes → [MATCHED]\n";
                visualTree += " │    │    │   Node 4: Numeric suffix?\n";
                
                if (isSuffix) {
                    visualTree += " │    │    │    ├─ Yes → [MATCHED]\n";
                    visualTree += " │    │    │    │   Node 5: Symbol affix?\n";
                    
                    if (isSymAffix) {
                        visualTree += " │    │    │    │    ├─ Yes → [MATCHED]\n";
                        visualTree += " │    │    │    │    │   Node 6: Length < 12?\n";
                        visualTree += password.length < 12 
                            ? " │    │    │    │    │    ├─ Yes → [FINAL RESULT] → RULE-BASED\n" 
                            : " │    │    │    │    │    └─ No  → [FINAL RESULT] → DICTIONARY\n";
                    } else {
                        visualTree += " │    │    │    │    └─ No → [NOT MATCHED]\n";
                        visualTree += " │    │    │    │         Node 7: Length < 12?\n";
                        visualTree += password.length < 12 
                            ? " │    │    │    │          ├─ Yes → [FINAL RESULT] → RULE-BASED\n" 
                            : " │    │    │    │          └─ No  → [FINAL RESULT] → DICTIONARY\n";
                    }
                } else {
                    visualTree += " │    │    │    └─ No → [NOT MATCHED]\n";
                    visualTree += " │    │    │         Node 8: Length < 12?\n";
                    visualTree += password.length < 12 
                        ? " │    │    │          ├─ Yes → [FINAL RESULT] → RULE-BASED\n" 
                        : " │    │    │          └─ No  → [FINAL RESULT] → DICTIONARY\n";
                }
            } else {
                visualTree += " │    │    └─ No → [NOT MATCHED]\n";
                visualTree += " │    │         Node 9: Length < 12?\n";
                visualTree += password.length < 12 
                    ? " │    │          ├─ Yes → [FINAL RESULT] → RULE-BASED\n" 
                    : " │    │          └─ No  → [FINAL RESULT] → DICTIONARY\n";
            }
        } else {
            visualTree += " │    └─ No → [NOT MATCHED]\n";
            visualTree += " │         Node 10: Length < 12?\n";
            visualTree += password.length < 12 
                ? " │          ├─ Yes → [FINAL RESULT] → DICTIONARY\n" 
                : " │          └─ No  → [FINAL RESULT] → DICTIONARY\n";
        }
    } else {
        visualTree += " └─ No → [NOT MATCHED]\n";
        visualTree += "      Node 11: Character class count < 3?\n";
        
        if (extractedFeatures.character_class_count < 3) {
            visualTree += `       ├─ Yes → [MATCHED] (Class Count: ${extractedFeatures.character_class_count})\n`;
            visualTree += "       │   Node 12: Has repetition?\n";
            visualTree += hasRep
                ? "       │    ├─ Yes → [FINAL RESULT] → BRUTE-FORCE\n"
                : "       │    └─ No  → [FINAL RESULT] → BRUTE-FORCE\n";
        } else {
            visualTree += "       └─ No → [NOT MATCHED]\n";
            visualTree += "            Node 13: Has sequence?\n";
            
            if (hasSeq) {
                visualTree += "             ├─ Yes → [MATCHED]\n";
                visualTree += "             │   Node 14: Has digit?\n";
                visualTree += hasDig
                    ? "             │    ├─ Yes → [FINAL RESULT] → RULE-BASED\n"
                    : "             │    └─ No  → [FINAL RESULT] → BRUTE-FORCE\n";
            } else {
                visualTree += "             └─ No → [NOT MATCHED]\n";
                visualTree += "                  Node 15: Length < 12?\n";
                visualTree += password.length < 12 
                    ? "                       ├─ Yes → [FINAL RESULT] → BRUTE-FORCE\n"
                    : "                       └─ No  → [FINAL RESULT] → BRUTE-FORCE\n";
            }
        }
    }
    
    return visualTree;
}

// ===== API ROUTE =====
app.post('/analyze', (req, res) => {
    const { password } = req.body;
    
    if (!password) {
        return res.status(400).json({ error: "Password is required" });
    }

    const extractedFeatures = extractFeatures(password);
    console.log("FEATURES:", extractedFeatures);

    const classificationResult = classifyPassword(extractedFeatures);
    
    // Kunin ang pormal at realistic strategies at breakdown
    const { tips, technicalBreakdown } = getStrategies(
        classificationResult.label,
        extractedFeatures,
        password
    );

    // I-generate ang tinukoy mong Tree Structure Base sa Input Properties
    const decisionTreeVisual = generateVisualTreePath(
        classificationResult.label,
        extractedFeatures,
        password
    );

    // Kalkulahin ang estimated entropy bits para sa UI data visualization charts
    const entropyBits = Math.round(password.length * Math.log2(extractedFeatures.character_class_count * 22 || 26));

    console.log("PASSWORD:", password);
    console.log("RESULT:", classificationResult);

    // Ipasa ang bagong pinalawak na JSON body response
    res.json({
    password: password,
    vulnerability: classificationResult.label,
    decision_path: classificationResult.path,
    features: extractedFeatures,
    
    // Iwanan lang natin ang live dynamic trace block
    visual_decision_tree_trace: decisionTreeVisual,
    
    analytics_breakdown: {
        password_length: extractedFeatures.length,
        character_classes_used: extractedFeatures.character_class_count,
        estimated_entropy_bits: entropyBits,
        dictionary_found: extractedFeatures.dictionary_present === 1 ? "Yes" : "No",
        rule_pattern_active: extractedFeatures.rule_pattern_present === 1 ? "Yes" : "No"
    },
    
    security_assessment: technicalBreakdown,
    strategies: tips,
    dataset_count: trainingDataset.length
    });
});

app.listen(3000, () => {
    console.log('🚀 ML Backend running on http://localhost:3000');
});