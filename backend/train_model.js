const fs = require("fs");
const csv = require("csv-parser");
const { DecisionTreeClassifier } = require("ml-cart");

const X = [];
const y = [];

// convert string labels to numbers
const labelMap = {
  "DICTIONARY": 0,
  "RULE-BASED": 1,
  "BRUTE-FORCE": 2
};
  
fs.createReadStream("dataset.csv")
  .pipe(csv())
  .on("data", (row) => {

    if (!row.label) {
      return;
    }

    const cleanedLabel = row.label.trim();

    if (labelMap[cleanedLabel] === undefined) {
      
      return;
    }

    X.push([
      Number(row.f_length),
      Number(row.f_dict),
      Number(row.f_leet),
      Number(row.f_num),
      Number(row.f_sym),
      Number(row.f_seq),
      Number(row.f_numeric_suffix),
      Number(row.f_rule_pattern)
    ]);

    y.push(labelMap[cleanedLabel]);
  })
  .on("end", () => {
    if (X.length === 0 || y.length === 0) {
      console.error("❌ Error: Walang valid na data na nakuha mula sa dataset.csv!");
      return;
    }

    console.log("Training samples successfully filtered:", X.length);
    console.log("Numeric labels sample:", y.slice(0, 20));

    const classifier = new DecisionTreeClassifier({
      gainFunction: "gini",
      maxDepth: 10,
      minNumSamples: 3
    });

    classifier.train(X, y);

    fs.writeFileSync(
      "model.json",
      JSON.stringify(classifier.toJSON())
    );

    console.log("✅ Model trained successfully without errors!");
  });