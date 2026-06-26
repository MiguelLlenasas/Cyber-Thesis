const fs = require("fs");
const { DecisionTreeClassifier } = require("ml-cart");

// load trained model
const model = JSON.parse(
  fs.readFileSync("model.json")
);

const classifier = DecisionTreeClassifier.load(model);

// sample features
const sample = [
  1, // 1. f_length
  1, // 2. f_dict  
  1, // 3. f_leet  
  1, // 4. f_num    
  1, // 5. f_sym    
  1, // 6. f_seq    
  0, // 7. f_numeric_suffix
  1  // 8. f_rule_pattern
];

// predict 
const prediction = classifier.predict([sample]);

const labelMap = {
  0: "DICTIONARY",
  1: "RULE-BASED",
  2: "BRUTE-FORCE"
};

console.log(
  "Prediction:",
  labelMap[prediction[0]]
);