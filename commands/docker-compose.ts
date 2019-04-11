/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { COMPOSE_FILE_GLOB_PATTERN } from '../constants';
import { ext } from '../extensionVariables';
import { quickPickWorkspaceFolder } from './utils/quickPickWorkspaceFolder';

async function getDockerComposeFileUris(folder: vscode.WorkspaceFolder): Promise<vscode.Uri[]> {
    return await vscode.workspace.findFiles(new vscode.RelativePattern(folder, COMPOSE_FILE_GLOB_PATTERN), null, 9999, undefined);
}

interface Item extends vscode.QuickPickItem {
    path: string,
    file: string
}

function createItem(folder: vscode.WorkspaceFolder, uri: vscode.Uri): Item {
    const filePath = folder ? path.join('.', uri.fsPath.substr(folder.uri.fsPath.length)) : uri.fsPath;

    return <Item>{
        description: undefined,
        file: filePath,
        label: filePath,
        path: path.dirname(filePath)
    };
}

function computeItems(folder: vscode.WorkspaceFolder, uris: vscode.Uri[]): vscode.QuickPickItem[] {
    const items: vscode.QuickPickItem[] = [];
    // tslint:disable-next-line:prefer-for-of // Grandfathered in
    for (let i = 0; i < uris.length; i++) {
        items.push(createItem(folder, uris[i]));
    }
    return items;
}

async function compose(commands: composeOperation[], message: string, dockerComposeFileUri?: vscode.Uri): Promise<void> {
    let folder: vscode.WorkspaceFolder = await quickPickWorkspaceFolder('To run Docker compose you must first open a folder or workspace in VS Code.');

    let commandParameterFileUris: vscode.Uri[];
    if (dockerComposeFileUri) {
        commandParameterFileUris = [dockerComposeFileUri];
    } else {
        let baseFile: string = vscode.workspace.getConfiguration('docker').get('baseComposeFilePath');
        let additionalFiles: string[] = vscode.workspace.getConfiguration('docker').get('additionalComposeFilePaths');
        additionalFiles.unshift(baseFile);
        commandParameterFileUris = additionalFiles.map(filePath => vscode.Uri.parse(filePath));
    }
    let selectedItems: Item[] = commandParameterFileUris.map(uri => createItem(folder, uri));
    if (!selectedItems.length) {
        // prompt for compose file
        const uris: vscode.Uri[] = await getDockerComposeFileUris(folder);
        if (!uris || uris.length === 0) {
            vscode.window.showInformationMessage('Couldn\'t find any docker-compose files in your workspace.');
            return;
        }

        const items: vscode.QuickPickItem[] = computeItems(folder, uris);
        selectedItems = [<Item>await ext.ui.showQuickPick(items, { placeHolder: `Choose Docker Compose file to ${message} containers.` })];
    }

    const terminal: vscode.Terminal = ext.terminalProvider.createTerminal('Docker Compose');
    const configOptions: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('docker');
    const build: string = configOptions.get('dockerComposeBuild', true) ? '--build' : '';
    const detached: string = configOptions.get('dockerComposeDetached', true) ? '-d' : '';

    terminal.sendText(`cd "${folder.uri.fsPath}"`);
    for (let command of commands) {
        let fileSpecifiers: string = selectedItems.map((item: Item) => `-f "${item.file}"`).join(" ");

        terminal.sendText(command.toLowerCase() === 'up' ? `docker-compose  ${command} ${fileSpecifiers} ${detached} ${build}` : `docker-compose ${fileSpecifiers} ${command}`);
        terminal.show();
    }

}

export async function composeUp(dockerComposeFileUri?: vscode.Uri): Promise<void> {
    return await compose([composeOperation.up], 'bring up', dockerComposeFileUri);
}

export async function composeDown(dockerComposeFileUri?: vscode.Uri): Promise<void> {
    return await compose([composeOperation.down], 'take down', dockerComposeFileUri);
}

export async function composeRestart(dockerComposeFileUri?: vscode.Uri): Promise<void> {
    return await compose([composeOperation.stop, composeOperation.start], 'restart', dockerComposeFileUri);
}

export async function composeStart(dockerComposeFileUri?: vscode.Uri): Promise<void> {
    return await compose([composeOperation.start], 'start', dockerComposeFileUri);
}

export async function composeStop(dockerComposeFileUri?: vscode.Uri): Promise<void> {
    return await compose([composeOperation.stop], 'stop', dockerComposeFileUri);
}

enum composeOperation {
    up = 'up',
    down = 'down',
    start = 'start',
    stop = 'stop'
}
