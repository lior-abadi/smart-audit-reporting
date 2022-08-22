import * as vscode from "vscode";
import * as sarDatabase from "./SAR.json"; // TODO: This should be pushed as a sample into the current workspace
import * as flatten from "flat";

// =============== TYPES DECLARATIONS ===============
// A SAR database with findings
type dbType = typeof sarDatabase;

// An appearance of a finding
type Appearance = {
  contractFile: string | undefined;
  loc: number | undefined;
  content: string | undefined;
};

// Structure of findings dictionary
type Finding = {
  type: string;
  title: string;
  prompt: string;
  appearances: Appearance[];
};

// Mapping for each finding (label ==> Finding) FindingMapping
type FindingMapping = Map<string, Finding>;

// =============== HELPER FUNCTIONS ===============
// Retrieves up to 200 *.sol files that are not inside node_modules
async function getSolFiles(): Promise<vscode.Uri[] | undefined> {
  return await vscode.workspace.findFiles(
    "**/*.sol",
    "**/node_modules/**",
    200
  );
}

function isInDatabase(db: dbType, label: string): boolean {
  const flatten_database: JSON = flatten(db);
  return Object.values(flatten_database)
    .toString()
    .toUpperCase()
    .includes(label.toUpperCase());

}

// Retrieves the content of a finding located in the SAR.json database.
function getFindingContent(db: dbType, type:string, label: string): [title: string, prompt: string]{
  
  let findingInDB = db.find(item => item.label.toUpperCase() === label.toUpperCase())

  if(findingInDB === undefined || findingInDB.type.toUpperCase()[0] !== type.toUpperCase()) {
    console.log(`Entered the not found logic`)
    console.log([label, db.filter(item => item.type.toUpperCase() === "NAN")[0].prompt])
    return [label, db.filter(item => item.type.toUpperCase() === "NAN")[0].prompt]
  }
  console.log([findingInDB.title, findingInDB.prompt])
  return [findingInDB.title, findingInDB.prompt]
}

// Stores each scrapped finding into a relevant mapping
function storeFindings(
  db: dbType,
  findingMapping: FindingMapping,
  findingType: string,
  findingLabel: string,
  currentAppearance: Appearance
) {
  // Retrieve the data from DB
  let [findingTitle, findingPrompt] : [string, string] = getFindingContent(db, findingType, findingLabel);

  // Case: first time this label appears
  if (!findingMapping.has(findingLabel)) {
    console.log(`First Time appearing`);
    findingMapping.set(findingLabel, {
      type: findingType,
      title: findingTitle,
      prompt: findingPrompt,
      appearances: [currentAppearance],
    });
  } else {
    // This scenario covers the case where a not defined finding appears again
    // It is only needed to push it to the appearances array. Need to cache the prev. stored values
    console.log(`Appeared before`);
    let cacheFinding: Finding = findingMapping.get(findingLabel)!;
    cacheFinding.appearances.push(currentAppearance);

    findingMapping.set(findingLabel, {
      type: cacheFinding.type,
      title: cacheFinding.title,
      prompt: cacheFinding.prompt,
      appearances: cacheFinding.appearances,
    });
  }
}

// ======================= EXTENSION ========================
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("vsSAR.generateGeneralReport", async () => {
      // Create the mappings that save the scrapped findings across the codebase.
      let gasFindings = new Map<string, Finding>();
      let lowFindings = new Map<string, Finding>();
      let nanFindings = new Map<string, Finding>();

      let dirFiles = await getSolFiles();

      if (dirFiles !== undefined) {
        // for (let file of dirFiles){

        // }

        // Create a vscode.TextDocument instance of current solidity file
        let doc = await vscode.workspace.openTextDocument(dirFiles[0]);

        // ============ LOOP OVER THE LINES OF A DOCUMENT ============
        // Loop over a document and check if there are findings reported. TODO: be wrapped into a outer loop for each .sol file.
        if (doc.lineCount !== 0) {
          let lineAmt: number = doc.lineCount;
          for (let lineIndex = 0; lineIndex < lineAmt; lineIndex++) {
            let currentLine: vscode.TextLine = doc.lineAt(lineIndex);

            // Check if the evaluated line contains a finding
            if (currentLine.text.toUpperCase().includes("@SAR")) {
              let findingText: string = currentLine.text.slice(
                currentLine.text.indexOf("@"),
                currentLine.text.length
              );

              let findingSeverity: string = findingText[5];
              let findingLabel: string = findingText.slice(
                7,
                findingText.length
              );

              // Evaluate the type of finding against the current SAR database
              let currentFileName: string | undefined = dirFiles[0]
                .toString()
                .split("/")
                .pop();
              let currentLoc: number | undefined = lineIndex + 1;
              let currentContent: string | undefined = currentLine.text.trim();

              let currentAppearance: Appearance = {
                contractFile: currentFileName,
                loc: currentLoc,
                content: currentContent,
              };

              // ============= FINDING PROCESSING =============

              // ------ FINDINGS NOT FOUND ------
              // Save a finding that it is not in the database in order to feed it back to the user.
              if (!isInDatabase(sarDatabase, findingLabel)) {
                // Due to the fact that is an unknown finding, we use the label as the content and title.
                storeFindings(
                  sarDatabase,
                  nanFindings,
                  "NaN",
                  findingLabel,
                  currentAppearance
                );
                continue; // This step avoids entering with a non existent finding into the known finding logic.
              }

              // ------ KNOWN FINDINGS WITHIN THE DATABASE ------
              // Will only reach the following lines if the finding is in the database.
              if(findingSeverity.toUpperCase() === "G") {
                storeFindings(
                  sarDatabase,
                  gasFindings,
                  findingSeverity,
                  findingLabel,
                  currentAppearance
                )
              }
              if(findingSeverity.toUpperCase() === "L") { // TODO: a L finding with a G in the @SAR slips out... prevent this.
                storeFindings(
                  sarDatabase,
                  lowFindings,
                  findingSeverity,
                  findingLabel,
                  currentAppearance
                )
              }

            }
          }
        }
        console.log(nanFindings);
        console.log(gasFindings);
        console.log(lowFindings)
      }
    })
  );
}

export function deactivate() {}
