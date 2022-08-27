import { TextEncoder } from "util";
import * as vscode from "vscode";

// Base template of findings that will be injected into the project directory.
import * as sampleDatabase from "./SAR.json";

// =============== TYPES DECLARATIONS ===============
// A SAR database with findings
type FindingDatabase = {
  type: string;
  label: string;
  title: string;
  prompt: string;
  path: string;
}[];

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
  db: FindingDatabase,
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

  // QA finding
  if (type.toUpperCase() === "Q")
    return [1, findingInDB.title, findingInDB.prompt];

  // L finding
  if (type.toUpperCase() === "L")
    return [2, findingInDB.title, findingInDB.prompt];

  // Case if no severity is recognized.
  return [404, findingInDB.title, findingInDB.prompt];
}

// Stores each scrapped finding into a relevant mapping
function storeFindings(
  db: FindingDatabase,
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

// Generates a root folder to store SAR files
async function generateRootFolder(db: FindingDatabase) {
  if (vscode.workspace.workspaceFolders !== undefined) {
    // Generating the SAR folder within the root of the project
    let f = vscode.workspace.workspaceFolders[0].uri.fsPath;
    let parsedUri = vscode.Uri.parse(`${f}/SAR`);
    let parsedFileName = vscode.Uri.parse(`${f}/SAR/SARdatabase.json`);

    let jsonDb = JSON.stringify(db, null, " ");

    let alreadyCreatedMsg: string[] = [
      "SAReporting: A SAR folder was already on the root folder.",
      "SAReporting: A SAR findings database was already created.",
    ];

    let generatedMsg: string[] = [
      "SAReporting: Generated Base Folder",
      "SAReporting: Generated Findings Sample Database",
    ];

    for (let index = 0; index < 2; index++) {
      let currentUri: vscode.Uri;
      index == 0 ? (currentUri = parsedUri) : (currentUri = parsedFileName);
      try {
        await vscode.workspace.fs.stat(parsedUri);
        vscode.window.showWarningMessage(alreadyCreatedMsg[index]);
      } catch {
        index == 0
          ? vscode.workspace.fs.createDirectory(parsedUri)
          : vscode.workspace.fs.writeFile(
              parsedFileName,
              str2arrayBuffer(jsonDb)
            );

        vscode.window.showInformationMessage(generatedMsg[index]);
      }
    }
  } else {
    let message: string =
      "Unable to resolve root directory. Create the findings file manually.";
    vscode.window.showErrorMessage(message);
  }
}

// Retrieves the data from the Database located within the project folder (which can be modified by the user)
async function getDatabase(): Promise<FindingDatabase | undefined> {
  if (vscode.workspace.workspaceFolders !== undefined) {
    let f = vscode.workspace.workspaceFolders[0].uri.fsPath;
    let parsedFileName = vscode.Uri.parse(`${f}/SAR/SARdatabase.json`);

    try {
      await vscode.workspace.fs.stat(parsedFileName);
      let rawData: Uint8Array = await vscode.workspace.fs.readFile(
        parsedFileName
      );
      let jsonData: string = Buffer.from(rawData).toString("utf-8");
      return JSON.parse(jsonData);
    } catch {
      vscode.window.showWarningMessage(
        `SAReporting: No Database found. Generate a database first.`
      );
    }
  }
}

function str2arrayBuffer(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

// ======================= EXTENSION ========================
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("vsSAR.generateGeneralReport", async () => {
      // Create the mappings that save the scrapped findings across the codebase.
      let nanFindings = new Map<string, Finding>();
      let gasFindings = new Map<string, Finding>();
      let qaFindings = new Map<string, Finding>();
      let lowFindings = new Map<string, Finding>();

      let sarDatabase: FindingDatabase | undefined = await getDatabase();
      if (sarDatabase === undefined) return;

      let dirFiles = await getSolFiles();
      if (dirFiles === undefined) {
        vscode.window.showWarningMessage(`SAReporting: No Solidity files found.`);
        return;
      }

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
              let currentContent: string | undefined = currentLine.text
                .split("//")[0]
                .trim();

              let currentAppearance: Appearance = {
                contractFile: currentFileName,
                loc: currentLoc,
                content: currentContent,
              };

              // ============= FINDING PROCESSING =============

              // Get the content and mapping id.
              let [mappingId, title, prompt]: [number, string, string] =
                getFindingContent(sarDatabase, findingSeverity, findingLabel);
              // mappingId = 404: NaN ; mappingId = 0: Gas ; mappingId = 1: QA mappingId = 2: Low
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
                    qaFindings,
                    findingSeverity,
                    findingLabel,
                    title,
                    prompt,
                    currentAppearance
                  );
                  break;

                case 2:
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
      if(nanFindings.size === 0 && gasFindings.size === 0 && qaFindings.size === 0 && lowFindings.size === 0){
        vscode.window.showWarningMessage(`SAReporting: No findings were recognized. Try tagging them.`);
      }

      console.log(nanFindings);
      console.log(gasFindings);
      console.log(qaFindings);
      console.log(lowFindings);
    }),

    vscode.commands.registerCommand(
      "vsSAR.createSampleFindingDatabase",
      async () => {
        generateRootFolder(sampleDatabase);
      }
    )
  );
}

export function deactivate() {}
