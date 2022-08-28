import { TextEncoder } from "util";
import { Marked } from "@ts-stack/markdown";
import * as vscode from "vscode";
import * as localfs from "fs/promises";
import path = require("path");

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

// Mapping for each finding (label ==> Finding)
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

// Retrieves the content of a finding located in the SAR.json database
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
      db.filter((item) => item.type.toUpperCase() === "404")[0].prompt,
    ];
  }
  // Gas finding
  if (type.toUpperCase() === "G")
    return [0, findingInDB.title, findingInDB.prompt];

  // NC finding
  if (type.toUpperCase() === "N")
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
    let jsonDb = JSON.stringify(db, null, " ");

    let foldersUri: vscode.Uri[] = [
      vscode.Uri.parse(`${f}/SAR`),
      vscode.Uri.parse(`${f}/SAR/SARFindings`),
      vscode.Uri.parse(`${f}/SAR/Reports`),
    ];

    let databaseUri: vscode.Uri = vscode.Uri.parse(`${f}/SAR/SARdatabase.json`);

    // Create root folders
    for (let currentUri of foldersUri) {
      let folderName: string = `${currentUri.path.substring(
        currentUri.path.lastIndexOf("/") + 1
      )}`;
      try {
        await vscode.workspace.fs.stat(currentUri);
        vscode.window.showWarningMessage(
          `SAReporting: ${folderName} already exists.`
        );
      } catch {
        vscode.workspace.fs.createDirectory(currentUri);
        vscode.window.showInformationMessage(
          `SAReporting: The folder ${folderName} was created.`
        );
      }
    }

    // Inject a database from the extension to the root
    try {
      await vscode.workspace.fs.stat(databaseUri);
      vscode.window.showWarningMessage(
        `SAReporting: The database was already on the SAR directory.`
      );
    } catch {
      vscode.workspace.fs.writeFile(databaseUri, str2arrayBuffer(jsonDb));
      vscode.window.showInformationMessage(
        `SAReporting: The database was created.}`
      );
    }

    // Inject each markdown finding file to the root
    await getFindingContentFromDatabase(foldersUri[1]);
  } else {
    let message: string =
      "Unable to resolve root directory. Create the findings file manually.";
    vscode.window.showErrorMessage(message);
  }
}

async function getFindingContentFromDatabase(targetUri: vscode.Uri) {
  let markdownContent = await localfs.readdir(
    path.resolve(__dirname, "SARFindings"),
    { withFileTypes: true }
  );
  for (let content of markdownContent) {
    let copyUri: vscode.Uri = vscode.Uri.parse(
      path.resolve(__dirname, "SARFindings") + `/${content.name}`
    );
    let fileName: string = `${copyUri.path.substring(
      copyUri.path.lastIndexOf("/") + 1
    )}`;
    try {
      await vscode.workspace.fs.copy(
        copyUri,
        vscode.Uri.parse(targetUri.path + `/${content.name}`),
        { overwrite: false }
      );
    } catch (err) {
      vscode.window.showWarningMessage(
        `SAReporting: The following file was already copied: ${fileName}.`
      );
    }
  }
}

function formatFindings(finding: Finding, id: number): string {
  let findingTitle: string =
    `<h3>${finding.type.toUpperCase()}-${id}` +
    " " +
    finding.title +
    "</h3> \n";
  let findingContent: string = `${finding.prompt}<br><br>`;
  let timesFound: string = "";
  if (finding.appearances.length === 1) {
    timesFound = `<em>Found ${finding.appearances.length} time</em>\n\n`;
  } else {
    timesFound = `<em>Found ${finding.appearances.length} times</em>\n\n`;
  }

  let packedAppearances: string = "";

  for (let singleAppearance of finding.appearances) {
    let cacheAppearance: string =
      "```solidity\n" +
      singleAppearance.contractFile +
      "   L" +
      singleAppearance.loc +
      ":       " +
      singleAppearance.content +
      "\n" +
      "```\n\n";
    packedAppearances = packedAppearances + cacheAppearance;
  }
  return (
    "<br>" + 
    findingTitle +
    findingContent +
    timesFound +
    packedAppearances +
    "<br>"
  );
}

// Generate a Severity.md report per severity of all findings.
function generateReport(findingMapping: FindingMapping) {
  // generate a markdown table with the summary of each finding and their N° appearances
  let arrayOfKeys: string[] = Array.from(findingMapping.keys());
  let id: number = 1;
  let reportString: string = "";

  for (let singleKey of arrayOfKeys) {
    reportString =
      reportString + formatFindings(findingMapping.get(singleKey)!, id);
    id += 1;
  }
  // console.log(reportString);
  createReportFile(findingMapping, reportString);
}

function createReportFile(
  findingMapping: FindingMapping,
  reportString: string
) {
  let currentSeverity: string | undefined = findingMapping.get(
    Array.from(findingMapping.keys())[0]
  )?.type;
  console.log(currentSeverity);
  if (currentSeverity === undefined) {
  }
  if (vscode.workspace.workspaceFolders !== undefined) {
    let f = vscode.workspace.workspaceFolders[0].uri.fsPath;
    let severityUri: vscode.Uri = vscode.Uri.parse(
      `${f}/SAR/Reports/${currentSeverity}.md`
    );

    // Create the buffer from the reportString.
    vscode.workspace.fs.writeFile(severityUri, str2arrayBuffer(reportString));
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

// Generates a byte buffer from a string
function str2arrayBuffer(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

// ======================= EXTENSION ========================
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("vsSAR.generateGeneralReport", async () => {
      vscode.window.showInformationMessage(
        `SAReporting: Generating general report`
      );
      // Create the mappings that save the scrapped findings across the codebase.
      let nanFindings = new Map<string, Finding>();
      let gasFindings = new Map<string, Finding>();
      let ncFindings = new Map<string, Finding>();
      let lowFindings = new Map<string, Finding>();

      let sarDatabase: FindingDatabase | undefined = await getDatabase();
      if (sarDatabase === undefined) return;

      let dirFiles = await getSolFiles();
      if (dirFiles === undefined) {
        vscode.window.showWarningMessage(
          `SAReporting: No Solidity files found.`
        );
        return;
      }

      // ============ LOOP OVER THE SOLIDITY DOCUMENTS ============
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
              // mappingId = 404: NaN ; mappingId = 0: Gas ; mappingId = 1: NC mappingId = 2: Low
              switch (mappingId) {
                case 404:
                  storeFindings(
                    sarDatabase,
                    nanFindings,
                    "404",
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
                    ncFindings,
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
      if (
        nanFindings.size === 0 &&
        gasFindings.size === 0 &&
        ncFindings.size === 0 &&
        lowFindings.size === 0
      ) {
        vscode.window.showWarningMessage(
          `SAReporting: No findings were recognized. Try tagging them.`
        );
      }
      let allFindings: FindingMapping[] = [
        nanFindings,
        gasFindings,
        ncFindings,
        lowFindings,
      ];
      // ============ GENERATE EACH REPORT ============
      for (let findingMapping of allFindings) {
        generateReport(findingMapping);
      }

      for (let findingMapping of allFindings) console.log(findingMapping);
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
