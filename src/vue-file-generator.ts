import {Command} from 'commander';
import fs from 'graceful-fs';
import path from 'path';
import packageJson from '../package.json' assert {type: 'json'};

interface Component{
	template?:string,
	script?:string,
	style?:string,
	styleScoped?:boolean
}

interface Components{
	[filename:string]:Component
}

const EXTENSIONS={
	template:[
		'html',
		'jade',
		'pug'
	],
	script:[
		'ts',
		'tsx',
		'js',
		'jsx',
		'coffee'
	],
	style:[
		'sass',
		'scss',
		'less',
		'styl'
	]
}as const;

const program=new Command();

program
	.version(packageJson.version)
	.name(packageJson.name)
	.option('-d, --debug','enables verbose logging',false)
	.option('-f, --folder','components are found in separate folders',false)
	.argument('[folder]','path to folder containing *.vue.(html|pug), *.vue.(ts|tsx|js|jsx) and/or *.vue.(sass|scss) files or subfolders containing these files','.')
	.parse(process.argv);

let components:Components={};
let folder=program.args[0]??'.';

for await(let file of await fs.promises.opendir(folder)){
	if(program.opts().folder){
		if(!file.isDirectory())continue;
		for await(let subfolderFile of await fs.promises.opendir(path.join(folder,file.name))){
			if(subfolderFile.isDirectory())continue;
			let type:keyof typeof EXTENSIONS;
			for(type in EXTENSIONS){
				for(let extension of EXTENSIONS[type]){
					if(subfolderFile.name!==file.name+'.vue.'+extension&&!(type==='style'&&subfolderFile.name===file.name+'.scoped.vue.'+extension))continue;
					if(components[file.name])(components[file.name] as any)[type]=extension;
					else components[file.name]={[type]:extension};
					if(type==='style'&&subfolderFile.name.endsWith('.scoped.vue.'+extension))components[file.name].styleScoped=true;
				}
			}
		}
		continue;
	}
	let type:keyof typeof EXTENSIONS;
	for(type in EXTENSIONS){
		for(let extension of EXTENSIONS[type]){
			if(!file.name.endsWith('.vue.'+extension))continue;
			let vueFilename=file.name.substring(0,file.name.length-extension.length-'.vue.'.length);
			if(components[vueFilename])(components[vueFilename] as any)[type]=extension;
			else components[vueFilename]={[type]:extension};
		}
	}
}

if(Object.keys(components).length===0){
	if(program.opts().debug)console.log('No components');
	process.exit(0);
}

let writeFilePromises:Promise<void>[]=[];

for(let vueFilename in components){
	console.log(vueFilename);
	let contents='';
	if(components[vueFilename].template){
		let src=(program.opts().folder?vueFilename+'/':'')+vueFilename+'.vue.'+components[vueFilename].template;
		contents+=`<template lang="${components[vueFilename].template}" src="${src}"></template>`;
		console.log(`\t${src}`);
	}
	if(components[vueFilename].script){
		let src=(program.opts().folder?vueFilename+'/':'')+vueFilename+'.vue.'+components[vueFilename].script;
		contents+=`${contents!==''?'\n':''}<script lang="${components[vueFilename].script}" src="${src}"></script>`;
		console.log(`\t${src}`);
	}
	if(components[vueFilename].style){
		let src=(program.opts().folder?vueFilename+'/':'')+vueFilename+(components[vueFilename].styleScoped?'.scoped':'')+'.vue.'+components[vueFilename].style;
		contents+=`${contents!==''?'\n':''}<style lang="${components[vueFilename].style}" src="${src}"${components[vueFilename].styleScoped?' scoped':''}"></style>`;
		console.log(`\t${src}`);
	}
	writeFilePromises.push(fs.promises.writeFile(path.join(folder,`${vueFilename}.vue`),contents));
	console.log('');
}

await Promise.all(writeFilePromises);