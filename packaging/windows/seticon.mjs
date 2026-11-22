import * as ResEdit from 'resedit';
import * as PE from 'pe-library';
import fs from 'fs';
const file='dist/win-unpacked/QC-App.exe';
const exe=PE.NtExecutable.from(fs.readFileSync(file),{ignoreCert:true});
const res=PE.NtExecutableResource.from(exe);
const ico=ResEdit.Data.IconFile.from(fs.readFileSync('build/icon.ico'));
const groups=ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const gid=groups.length?groups[0].id:1, lang=groups.length?groups[0].lang:1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries,gid,lang,ico.icons.map(i=>i.data));
const vi=ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
if(vi){
  vi.setStringValues({lang:1033,codepage:1200},{FileDescription:'QC App - construction inspection',ProductName:'QC App',CompanyName:'QC App',OriginalFilename:'QC-App.exe',InternalName:'QC-App'});
  vi.setFileVersion(0,1,0,0,1033);vi.setProductVersion(0,1,0,0,1033);vi.outputToResourceEntries(res.entries);
}
res.outputResource(exe);
fs.writeFileSync(file,Buffer.from(exe.generate()));
console.log('icon + version set, groups:',groups.length);
