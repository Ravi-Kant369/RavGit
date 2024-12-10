#!/usr/bin/env node
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { diffLines } from 'diff';
import chalk from 'chalk';
import { Command } from 'commander';

const program = new Command();

class RavGit{
   
    constructor(repoPath='.'){
        this.repoPath = path.join(repoPath, '.ravgit');
        this.objectsPath = path.join(this.repoPath, 'objects'); // .ravgit/objects
        this.headPath = path.join(this.repoPath, 'HEAD');
        this.indexPath = path.join(this.repoPath, 'index');
        this.init();
    }

    async init (){
        try {
            await fs.mkdir(this.objectsPath, { recursive: true });
            await fs.writeFile(this.headPath, '', { flag: 'wx' });
            await fs.writeFile(this.indexPath, JSON.stringify([]), { flag: 'wx' });
            console.log(chalk.green('Repository initialised successfully.'));
        } catch (error) {
            console.error(chalk.yellow('Repository is already initialised.'));
        }


    }
    hashObjects(content){
        return crypto.createHash('sha1').update(content,'utf-8').digest('hex');
    }
    async add(fileToBeAdded){
         try {
            
        const fileData = await fs.readFile(fileToBeAdded, {encoding:'utf-8'});
        const fileHash = this.hashObjects(fileData);
        
        const newFileHashedObjectPath = path.join(this.objectsPath,fileHash);
        await fs.writeFile(newFileHashedObjectPath,fileData);
        await this.updateStagingArea(fileToBeAdded,fileHash);
        console.log(chalk.green(`Added ${fileToBeAdded}`));

         } catch (error) {
            console.error(chalk.red('Error in adding file:'), error.message);
         }
    }

    async updateStagingArea(filePath, fileHash){
        try {
            const index = JSON.parse(await fs.readFile(this.indexPath, {encoding:'utf-8'}));
            index.push({ path:filePath, hash: fileHash});
            await fs.writeFile(this.indexPath ,JSON.stringify(index));
        } catch (error) {
            console.error(chalk.red('Error in updating staging area:'), error.message);
        }

    }

    async getCurrentHead(){
        try {
            return await fs.readFile(this.headPath, {encoding: 'utf-8'});
        } catch (error) {
            console.log(chalk.red('Error Finding HEAD:',error.message))
            return null;
        }
    }

    async commit(message){
       try {
        const index = JSON.parse(await fs.readFile(this.indexPath, {encoding:'utf-8'}));
        const parentCommit = await this.getCurrentHead();

        const commitData ={
            timeStamp: new Date().toISOString(),
            message,
            files:index,
            parent: parentCommit || null,
            username: process.env.USERNAME || 'anonymous'
        };

        const commitHash = this.hashObjects(JSON.stringify(commitData));
        const commitPath = path.join(this.objectsPath,commitHash);
        await fs.writeFile(commitPath ,JSON.stringify(commitData));
        await fs.writeFile(this.headPath,commitHash);
        await fs.writeFile(this.indexPath,JSON.stringify([]));
        console.log(chalk.green(`Commit Successfully created:${commitHash}`));

       } catch (error) {
        console.error(chalk.red('Error in committing:'), error.message);
       }
    }
    
   

    async log(){
       try {
        let currentCommitHash = await this.getCurrentHead();
        while(currentCommitHash) {
            const commitData = JSON.parse(await fs.readFile(path.join(this.objectsPath,currentCommitHash),{encoding:'utf-8'}));
           
            console.log('---------------------------------\n')
            console.log(`Commit: ${currentCommitHash}\nDAte:${commitData.timeStamp}\n\n${commitData.message}\n\n`);
            currentCommitHash = commitData.parent;
        }
       } catch (error) {
        console.error(chalk.red('Error in retrieving the commit log:'), error.message);
       }
    }

    
    async getParentFileContent(parentCommitData ,filePath){
        const parentFile = parentCommitData.files.find(file => file.path ===filePath);
        if(parentFile){
           return await this.getFileContent(parentFile.hash);
        }
    }

    
    async getCommitData(commitHash){
        const commitPath =path.join(this.objectsPath, commitHash);
        try {
            return await fs.readFile(commitPath,{encoding:'utf-8'});
        } catch (error) {
            
            console.log("Failed to read the commit data",error);
            return null;
        
        }
    }
    
    async getFileContent(fileHash){
        const objectPath = path.join(this.objectsPath, fileHash);
        return fs.readFile(objectPath, {encoding:'utf-8'});
    }
     
    async showCommitDiff(commitHash) {
        try {
            const commitData = JSON.parse(await this.getCommitData(commitHash));
            if (!commitData) {
                console.log(chalk.red('Commit not found.'));
                return;
            }
            console.log(chalk.blue('Changes in the last commit are:'));
    
            for (const file of commitData.files) {
                console.log(chalk.blue(`\nFile: ${file.path}`));
                const fileContent = await this.getFileContent(file.hash);
                console.log(chalk.white(fileContent));
    
                if (commitData.parent) {
                    const parentCommitData = JSON.parse(await this.getCommitData(commitData.parent));
                    const parentFileContent = await this.getParentFileContent(parentCommitData, file.path);
                    if (parentFileContent !== undefined) {
                        console.log(chalk.yellow('\nDiff:'));
                        const diff = diffLines(parentFileContent, fileContent);
    
                        diff.forEach(part => {
                            if (part.added) {
                                console.log(chalk.green(`++ ${part.value}`)); 
                            } else if (part.removed) {
                                console.log(chalk.red(`-- ${part.value}`)); 
                            } else {
                                console.log(chalk.grey(part.value)); 
                            }
                        });
                    } else {
                        console.log(chalk.green('New file in this commit.'));
                    }
                } else {
                    console.log(chalk.green('First commit.'));
                }
            }
        } catch (error) {
            console.error(chalk.red('Error showing commit diff:'), error.message);
        }
    }


}


program.command('init').action(async () => {
    const ravgit = new RavGit();
    ravgit.init()
});

program.command('add <file>').action(async (file) => {
    const ravgit = new RavGit();
    await ravgit.add(file);
});

program.command('commit <message>').action(async (message) => {
    const ravgit = new RavGit();
    await ravgit.commit(message);
});

program.command('log').action(async () => {
    const ravgit = new RavGit();
    await ravgit.log();
});

program.command('show <commitHash>').action(async (commitHash) => {
    const ravgit = new RavGit();
    await ravgit.showCommitDiff(commitHash);
});

program.parse(process.argv);
