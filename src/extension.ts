import { TextEncoder } from "util";
import * as vscode from "vscode";
import * as localfs from "fs/promises";
import path = require("path");
import { markdownTable } from "./markdownTable/markdownTable";

// Base template of findings that will be injected into the project directory.
import * as sampleDatabase from "./SAR.json";

// =============== TYPES DECLARATIONS ===============

// A SAR database with findings
type singleFinding = {
  type: string;
  label: string;
  title: string;
  prompt: string;
  path: string;
};

type FindingDatabase = singleFinding[];

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

    // Inject each markdown finding file to the root (EXPERIMENTAL)
    // await getFindingContentFromDatabase(foldersUri[1]);
  } else {
    let message: string =
      "Unable to resolve root directory. Create the findings file manually.";
    vscode.window.showErrorMessage(message);
  }
}

// Injects .md files of findings into the directory (preliminary feature)
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

// Generates the markdown format for each finding processing file duplicates
function formatFindings(finding: Finding, id: number): string {
  let findingTitle: string =
    `<h3> [${finding.type.toUpperCase()}-${id}]` +
    " " +
    `${finding.title}` +
    " </h3> \n";
  let findingContent: string = `${finding.prompt}<br><br>`;
  let timesFound: string = "";
  let numberOfInstances: number = finding.appearances.length;
  if (numberOfInstances === 1) {
    timesFound = `<em>Found ${numberOfInstances} time</em>\n\n`;
  } else {
    timesFound = `<em>Found ${numberOfInstances} times</em>\n\n`;
  }

  let packedAppearances: string = "";
  let alreadyAppeared: string[] = [];

  for (let singleAppearance of finding.appearances) {
    let onTheSameFile: Appearance[];
    let singleFileLoc: string = "";
    if (singleAppearance.contractFile !== undefined) {
      if (
        alreadyAppeared.find(
          (item) => item === singleAppearance.contractFile
        ) === undefined
      ) {
        onTheSameFile = finding.appearances.filter(
          (item) => item.contractFile === singleAppearance.contractFile
        );
        alreadyAppeared.push(singleAppearance.contractFile);

        for (let sameFileSingle of onTheSameFile) {
          let cacheFormatting: string =
            sameFileSingle.contractFile +
            "?????????L" +
            sameFileSingle.loc +
            ": ??????????????????" +
            sameFileSingle.content +
            "\n";

          singleFileLoc = singleFileLoc + cacheFormatting;
        }

        singleFileLoc = "```solidity\n" + singleFileLoc + "```\n";
      }
    }
    packedAppearances = packedAppearances + singleFileLoc;
  }
  return (
    findingTitle + findingContent + timesFound + packedAppearances + "<br>"
  );
}

// Generate a Severity.md report per severity of all findings.
function generateReport(findingMapping: FindingMapping) {
  // generate a markdown table with the summary of each finding and their N?? appearances
  let arrayOfKeys: string[] = Array.from(findingMapping.keys());
  let id: number = 1;
  let reportString: string = "";
  let tableArray: string[][] = [];
  let currentSeverity: string | undefined;
  let instancesCount: number = 0;

  tableArray.push([" ", "Title", "N?? of Appearances"]);

  for (let singleKey of arrayOfKeys) {
    let currentFinding: Finding = findingMapping.get(singleKey)!;

    if (currentSeverity === undefined) {
      currentSeverity = currentFinding.type
        .toLowerCase()
        .charAt(0)
        .toUpperCase();
    }

    // Capturing the whole finding
    let formattedFinding: string = formatFindings(currentFinding, id);

    // Appending them to the report
    reportString = reportString + formattedFinding;

    // Capturing the table rows
    tableArray.push([
      `[${currentFinding.type.toUpperCase()}-${id}]`,
      currentFinding.title,
      `${currentFinding.appearances.length}`,
    ]);
    instancesCount = instancesCount + currentFinding.appearances.length;
    id += 1;
  }

  let summaryTable: string = markdownTable(tableArray, {
    align: ["c", "l", "c"],
  });

  let issueText: string = "";
  currentSeverity == "G"
    ? (issueText = "Optimizations")
    : (issueText = "Risk Issues");
  if (currentSeverity === "404") currentSeverity = "Not Found";
  if (currentSeverity === "G") currentSeverity = "Gas";
  if (currentSeverity === "N") currentSeverity = "Non-critical";
  if (currentSeverity === "L") currentSeverity = "Low";
  let titleAndTable: string =
    `<h3>${currentSeverity} ${issueText}</h3> \n\n` +
    summaryTable +
    `\n\n` +
    `<em>Total: ${instancesCount} appearances over ${id - 1} issues.</em> \n`;

  let reportWithContentAndTable: string =
    titleAndTable +
    `\n\n <h2>${currentSeverity} ${issueText}</h2> \n` +
    reportString;

  createReportFile(findingMapping, reportWithContentAndTable);
}

// Gathers the formatted reports and saves their markdown files.
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

function bubbleSorting(a: singleFinding, b: singleFinding): number {
  let aLabel: string = a.label.toLowerCase();
  let bLabel: string = b.label.toLowerCase();
  return aLabel < bLabel ? -1 : aLabel > bLabel ? 1 : 0;
}

// Generates a byte buffer from a string
function str2arrayBuffer(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

// Format each finding name and generates a table (used for createFindingsIndex)
function formatFindingIndex(filteredFindings: FindingDatabase): string {
  let tableArray: string[][] = [];
  tableArray.push(["Label", "Title"]);

  for (let finding of filteredFindings) {
    tableArray.push([finding.label, finding.title]);
  }

  return markdownTable(tableArray, {
    align: ["l", "l"],
  });
}

// Saves the finding index within the SAR folder
function saveFindingIndex(findings: FindingDatabase[]) {
  let indexTables: string[] = [];
  for (let filteredFinding of findings) {
    indexTables.push(formatFindingIndex(filteredFinding));
  }

  let rawText: string =
    `<h2>Gas Optimizations</h2> \n\n` +
    indexTables[0] +
    `\n\n\n` +
    `<h2>Non Critical Issues</h2> \n\n` +
    indexTables[1] +
    `\n\n\n` +
    `<h2>Low Risk Issues</h2> \n\n` +
    indexTables[2] +
    `\n\n\n`;

  if (vscode.workspace.workspaceFolders !== undefined) {
    let f = vscode.workspace.workspaceFolders[0].uri.fsPath;
    let indexUri: vscode.Uri = vscode.Uri.parse(`${f}/SAR/00-FindingIndex.md`);

    // Create the buffer from the reportString.
    vscode.workspace.fs.writeFile(indexUri, str2arrayBuffer(rawText));
  }
}

// ======================= EXTENSION ========================
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    // Generates a general report of findings
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
              ).trim();

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
      vscode.window.showInformationMessage(
        `SAReporting: Reports were successfully generated`
      );
    }),

    // Generates a root folder along with a database sample
    vscode.commands.registerCommand(
      "vsSAR.createSampleFindingDatabase",
      async () => {
        generateRootFolder(sampleDatabase);
      }
    ),
    
    // Generates an index of the findings available within the database
    vscode.commands.registerCommand("vsSAR.createFindingsIndex", async () => {
      vscode.window.showInformationMessage(
        `SAReporting: Generating finding index`
      );
      let sarDatabase: FindingDatabase | undefined = await getDatabase();
      if (sarDatabase === undefined) return;
      let filtered: FindingDatabase[] = [];

      filtered.push(
        sarDatabase
          .filter((finding) => finding.type.toUpperCase() === "GAS")
          .sort(function (a, b) {
            return bubbleSorting(a, b);
          })
      );

      filtered.push(
        sarDatabase
          .filter((finding) => finding.type.toUpperCase() === "N")
          .sort(function (a, b) {
            return bubbleSorting(a, b);
          })
      );

      filtered.push(
        sarDatabase
          .filter((finding) => finding.type.toUpperCase() === "LOW")
          .sort(function (a, b) {
            return bubbleSorting(a, b);
          })
      );

      saveFindingIndex(filtered);
      vscode.window.showInformationMessage(
        `SAReporting: Finding Index generated`
      );
    })
  );
}

export function deactivate() {}
