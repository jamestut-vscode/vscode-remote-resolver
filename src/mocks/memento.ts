import * as vscode from 'vscode';
import fs = require('fs');

export class MockFileMemento implements vscode.Memento {
    public data: any;

    constructor(
        private fileName: string
    ) {
        this.data = JSON.parse(fs.readFileSync(this.fileName, 'utf8'));
    }

    keys(): readonly string[] {
        return Object.keys(this.data);
    }

    get<T>(key: string): T | undefined;

    get<T>(key: string, defaultValue: T): T;

    get(key: string, ...args: any[]): any {
        const ret = this.data[key];
        return ret !== undefined ? ret : args[0];
    }

    update(key: string, value: any): Thenable<void> {
        return new Promise<void>((resolve, _) => {
            this.data[key] = value;
            fs.writeFileSync(this.fileName, JSON.stringify(this.data, null, 4));
            resolve();
        });
    }
}
