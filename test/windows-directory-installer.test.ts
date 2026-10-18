import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertWindowsExecutable, directoryInstallSection, directoryInstallerExits, directoryInstallUtil, directoryAssistedInstaller } from '../scripts/windows-directory-installer.mjs'

const require = createRequire(import.meta.url)
const template = join(dirname(require.resolve('app-builder-lib/package.json')), 'templates', 'nsis', 'installSection.nsh')
const installUtil = join(dirname(require.resolve('app-builder-lib/package.json')), 'templates', 'nsis', 'include', 'installUtil.nsh')

describe('pinned NSIS directory transaction', () => {
  it('preserves the registered custom directory during an assisted update', async () => {
    const source = await readFile(join(dirname(template), 'assistedInstaller.nsh'), 'utf8')
    const adapted = directoryAssistedInstaller(source)
    expect(adapted).toContain('Function instFilesPre\n      ${IfNot} ${isUpdated}\n')
    expect(adapted).toContain('StrCpy $INSTDIR "$INSTDIR\\${APP_FILENAME}"')
    expect(() => directoryAssistedInstaller('changed template')).toThrow('NSIS template changed')
  })
  it('accepts Windows PE headers and rejects host binaries', () => {
    // Header validation is independent of the machine running the build.
    const pe = Buffer.alloc(0x48)
    pe.write('MZ')
    pe.writeUInt32LE(0x40, 0x3c)
    pe.write('PE\0\0', 0x40)
    pe.writeUInt16LE(0x14c, 0x44)
    expect(() => assertWindowsExecutable(pe)).not.toThrow()
    expect(() => assertWindowsExecutable(Buffer.from('Mach-O'))).toThrow('not a Windows PE')
    pe.writeUInt16LE(0xaa64, 0x44)
    expect(() => assertWindowsExecutable(pe)).toThrow('unsupported PE machine')
  })
  it('stages before app shutdown and promotes before registration', async () => {
    const source = await readFile(template, 'utf8')
    const adapted = directoryInstallSection(source)
    expect(adapted.indexOf('!insertmacro dshStageApplication'))
      .toBeLessThan(adapted.indexOf('!insertmacro CHECK_APP_RUNNING'))
    expect(adapted.indexOf('Call dshPromoteDirectories'))
      .toBeLessThan(adapted.indexOf('!insertmacro registryAddInstallInfo'))
    expect(adapted).toContain('!macroundef uninstallOldVersion')
    expect(adapted).not.toContain('Call uninstallOldVersion')
    expect(adapted).not.toContain('!insertmacro installApplicationFiles\n!insertmacro registryAddInstallInfo')
    expect(directoryInstallerExits('Quit\n')).toContain('Call dshCleanupDirectories')
    const adaptedUtil = directoryInstallUtil(await readFile(installUtil, 'utf8'))
    expect(adaptedUtil).not.toContain('Function uninstallOldVersion')
    expect(adaptedUtil).not.toContain('Function GetInQuotes')
    expect(adaptedUtil).not.toContain('Function GetFileParent')
  })

  it('rejects a changed electron-builder template', () => {
    expect(() => directoryInstallSection('!include installer.nsh'))
      .toThrow('electron-builder NSIS template changed')
  })
})

describe('hardened directory transaction (#48)', () => {
  const directories = join(dirname(dirname(require.resolve('./windows-directory-installer.test.ts'))), 'build', 'installer-directories.nsh')
  const installer = join(dirname(dirname(require.resolve('./windows-directory-installer.test.ts'))), 'build', 'installer.nsh')

  it('captures the Windows error and retries only transient lock errors', async () => {
    const source = await readFile(directories, 'utf8')
    // MoveFileEx exposes GetLastError before rollback overwrites it.
    expect(source).toContain("MoveFileExW(w \"${SOURCE}\", w \"${DESTINATION}\", i 0) i.r2 ?e")
    // Retry is bounded and only for access denied / sharing / lock violation.
    expect(source).toContain('${AndIf} ${RESULT} != 33')
    expect(source.match(/IntOp \$0 \$0 \+ 1/g)).toHaveLength(1)
    expect(source).toContain('IntOp $1 $0 * 250')
    expect(source).toContain('Sleep $1')
    // Evidence lands in a log that survives the installer exit.
    expect(source).toContain('$TEMP\\godot-codely-installer-directories.log')
  })

  it('routes every promote and restore rename through the operation macro', async () => {
    const source = await readFile(directories, 'utf8')
    const promote = source.slice(source.indexOf('Function dshPromoteDirectories'), source.indexOf('!macro dshFinishDirectories'))
    expect(promote.match(/!insertmacro dshDirectoryOperation/g) ?? []).toHaveLength(2)
    expect(promote).toContain('Call dshRollbackDirectories')
    expect(promote).toContain('!insertmacro dshReportDirectoryFailure')
    expect(promote).toContain('SetErrors')
    const rollback = source.slice(source.indexOf('Function dshRollbackDirectories'), source.indexOf('Function dshPromoteDirectories'))
    expect(rollback.match(/!insertmacro dshDirectoryOperation/g) ?? []).toHaveLength(1)
    expect(rollback).toContain('$dshRestoreError')
    // Recursive cleanup stays best-effort recursive removal.
    expect(rollback).toContain('RMDir /r')
  })

  it('reports failures instead of exiting silently', async () => {
    const dirs = await readFile(directories, 'utf8')
    expect(dirs).toContain('!ifmacrodef customInstallerDirectoryFailed')
    expect(dirs).toContain('!ifmacrodef customInstallerExtractFailed')
    const inst = await readFile(installer, 'utf8')
    expect(inst).toContain('!macro customInstallerDirectoryFailed')
    expect(inst).toContain('!macro customInstallerExtractFailed')
    expect(inst).toContain('MessageBox MB_OK|MB_ICONEXCLAMATION')
    // Silent installs keep the non-interactive exit contract.
    expect(inst).toContain('IfSilent +2 0')
  })

  it('keeps the silent exit contract on promote failure', async () => {
    const source = await readFile(join(dirname(template), 'installSection.nsh'), 'utf8')
    const adapted = directoryInstallSection(source)
    expect(adapted).toContain('Call dshPromoteDirectories\nIfErrors 0 +3\n  SetErrorLevel 2\n  Quit')
  })
})
