import * as vscode from "vscode";
import * as sarDatabase from "./SAR.json"; // TODO: This should be pushed as a sample into the current workspace

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

// Retrieves the content of a finding located in the SAR.json database.
function getFindingContent(
  db: dbType,
  type: string,
  label: string
): [mappingToPoint: number, title: string, prompt: string] {
  let findingInDB = db.find(
    (item) => item.label.toUpperCase() === label.toUpperCase()
  );

  // If it is not found within the database or there is a mismatch of severities.
  if (
    findingInDB === undefined ||
    findingInDB.type.toUpperCase()[0] !== type.toUpperCase()
  ) {
    return [
      404,
      label,
      db.filter((item) => item.type.toUpperCase() === "NAN")[0].prompt,
    ];
  }
  // Gas finding
  if (type.toUpperCase() === "G")
    return [0, findingInDB.title, findingInDB.prompt];

  // QA/Low finding
  if (type.toUpperCase() === "L")
    return [1, findingInDB.title, findingInDB.prompt];

  // Case if no severity is recognized.
  return [404, findingInDB.title, findingInDB.prompt];
}

// Stores each scrapped finding into a relevant mapping
function storeFindings(
  db: dbType,
  findingMapping: FindingMapping,
  findingType: string,
  findingLabel: string,
  findingTitle: string,
  findingPrompt: string,
  currentAppearance: Appearance
) {
  // Case: first time this label appears
  if (!findingMapping.has(findingLabel)) {
    findingMapping.set(findingLabel, {
      type: findingType,
      title: findingTitle,
      prompt: findingPrompt,
      appearances: [currentAppearance],
    });
  } else {
    // This scenario covers the case where a not defined finding appears again
    // It is only needed to push it to the appearances array. Need to cache the prev. stored values
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
      console.log(dirFiles);

      if (dirFiles !== undefined) {
        for (let file of dirFiles) {
          // Create a vscode.TextDocument instance of current solidity file
          let doc = await vscode.workspace.openTextDocument(file);

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
                let currentFileName: string | undefined = file
                  .toString()
                  .split("/")
                  .pop();
                let currentLoc: number | undefined = lineIndex + 1;
                let currentContent: string | undefined =
                  currentLine.text.trim();

                let currentAppearance: Appearance = {
                  contractFile: currentFileName,
                  loc: currentLoc,
                  content: currentContent,
                };

                // ============= FINDING PROCESSING =============

                // Get the content and mapping id.
                let [mappingId, title, prompt]: [number, string, string] =
                  getFindingContent(sarDatabase, findingSeverity, findingLabel);
                // mappingId = 404: NaN ; mappingId = 0: Gas ; mappingId = 1: Low/QA
                switch (mappingId) {
                  case 404:
                    storeFindings(
                      sarDatabase,
                      nanFindings,
                      findingSeverity,
                      findingLabel,
                      title,
                      prompt,
                      currentAppearance
                    );
                    break;

                  case 0:
                    storeFindings(
                      sarDatabase,
                      gasFindings,
                      findingSeverity,
                      findingLabel,
                      title,
                      prompt,
                      currentAppearance
                    );
                    break;

                  case 1:
                    storeFindings(
                      sarDatabase,
                      lowFindings,
                      findingSeverity,
                      findingLabel,
                      title,
                      prompt,
                      currentAppearance
                    );
                    break;

                  default:
                    break;
                }
              }
            }
          }
        }
        console.log(nanFindings);
        console.log(gasFindings);
        console.log(lowFindings);
      }
    }),

    vscode.commands.registerCommand(
      "vsSAR.createSampleFindingDatabase",
      async () => {
        console.log(`SAReporting: Generating sample finding file...`);
        vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "SAReporting: Generating sample finding file",
            cancellable: true,
          },
          (progress, token) => {
            token.onCancellationRequested(() => {
              console.log("User canceled the report generation.");
            });

            progress.report({ increment: 0 });

            setTimeout(() => {
              progress.report({ increment: 10 });
            }, 1000);

            setTimeout(() => {
              progress.report({ increment: 40 });
            }, 2000);

            setTimeout(() => {
              progress.report({ increment: 50 });
            }, 3000);

            const p = new Promise<void>((resolve) => {
              setTimeout(() => {
                resolve();
              }, 4000);
            });

            return p;
          }
        );
      
      }
    )
  );
}

export function deactivate() {}
