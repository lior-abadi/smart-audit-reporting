import * as vscode from "vscode";
import * as sarDatabase from "./SAR.json"; // TODO: This should be pushed as a sample into the current workspace
import * as flatten from "flat";

// Types declarations
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
  title: string;
  prompt: string;
  appearances: Appearance[];
};

async function getSolFiles(): Promise<vscode.Uri[] | undefined> {
  return await vscode.workspace.findFiles(
    "**/*.sol",
    "**/node_modules/**",
    100
  );
}

function isInDatabase(db: dbType, label: string): boolean {
  const flatten_database: JSON = flatten(db);

  return Object.values(flatten_database)
    .toString()
    .toUpperCase()
    .includes(label.toUpperCase());
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("vsSAR.generateGeneralReport", async () => {
      // Create the mappings that save the scarpped findings across the codebase.
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

              vscode.window.showWarningMessage(
                `${findingLabel} + ${sarDatabase.gas.length} + ${findingSeverity}`
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
                // Case: first time this label appears
                if (!nanFindings.has(findingLabel)) {
                  console.log(`Label not found`);
                  nanFindings.set(findingLabel, {
                    title: findingLabel,
                    prompt: findingLabel,
                    appearances: [currentAppearance],
                  });
                } else {
                  // This scenario covers the case where a not defined finding appears again
                  // It is only needed to push it to the appearances array. Need to cache the prev. stored values
                  console.log(`Label found`);
                  let cacheFinding: Finding = nanFindings.get(findingLabel)!;
                  cacheFinding.appearances.push(currentAppearance);

                  nanFindings.set(findingLabel, {
                    title: cacheFinding.title,
                    prompt: cacheFinding.prompt,
                    appearances: cacheFinding.appearances,
                  });
                }
				continue; // This step avoids entering with a non existent finding into the known finding logic.
              }

              // KNOWN FINDINGS WITHIN THE DATABASE
			  console.log(`Inside the known logic! For finding with label: ${findingLabel}`)
              

            }
          }
        }
        console.log(nanFindings);
      }
    })
  );
}

export function deactivate() {}
