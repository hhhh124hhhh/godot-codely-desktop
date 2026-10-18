; Adapted from deepseek-ai/deepseek-harness/apps/desktop/scripts/installer-directories.nsh.
; Directory transaction hardening (error capture, bounded retry, failure reporting)
; ported from upstream: an open file inside the staged payload (e.g. real-time AV
; scanning the freshly extracted executable) makes the promote rename fail with
; Windows error 5/32/33; without retry and without surfacing the error the
; installer silently rolled back and the upgrade looked like it did nothing.
!include "LogicLib.nsh"

Var dshFinalDirectory
Var dshNewDirectory
Var dshOldDirectory
Var dshOldMoved
Var dshNewMoved
Var dshDirectoryError
Var dshRestoreError
Var dshRecoveryStopped

; MoveFileEx exposes the Windows error before rollback changes it.
; Retry only transient lock errors (5 access denied, 32 sharing violation,
; 33 lock violation) with linear backoff; anything else fails immediately.
; ${RESULT} receives 0 on success or the genuine Windows error on failure.
; 20 attempts with 250ms steps keep the transaction window around one minute:
; consumer AV suites were observed holding locks on the freshly extracted
; executable for more than the previous 10-attempt (~14s) window.
; Note: this toolchain's System plugin maps .rN outputs onto $N registers.
!macro dshDirectoryOperation SOURCE DESTINATION RESULT PHASE
  Push $0
  Push $1
  Push $2
  StrCpy $0 0
  ${Do}
    System::Call 'kernel32::MoveFileExW(w "${SOURCE}", w "${DESTINATION}", i 0) i.r2 ?e'
    Pop ${RESULT}
    ${If} $2 != 0
      StrCpy ${RESULT} 0
      ${ExitDo}
    ${EndIf}
    ${If} ${RESULT} != 5
    ${AndIf} ${RESULT} != 32
    ${AndIf} ${RESULT} != 33
      ${ExitDo}
    ${EndIf}
    ClearErrors
    FileOpen $1 "$TEMP\godot-codely-installer-directories.log" a
    ${IfNot} ${Errors}
      FileSeek $1 0 END
      FileWrite $1 "${PHASE}: transient Windows error ${RESULT}, retrying: ${SOURCE} -> ${DESTINATION}$\r$\n"
      FileClose $1
    ${EndIf}
    IntOp $0 $0 + 1
    ${If} $0 >= 20
      ${ExitDo}
    ${EndIf}
    IntOp $1 $0 * 250
    Sleep $1
  ${Loop}
  Pop $2
  Pop $1
  Pop $0
!macroend

!macro dshLogDirectoryFailure LINE
  ClearErrors
  FileOpen $0 "$TEMP\godot-codely-installer-directories.log" a
  ${IfNot} ${Errors}
    FileSeek $0 0 END
    FileWrite $0 "${LINE}$\r$\n"
    FileClose $0
  ${EndIf}
!macroend

; Reporting hook: the product installer.nsh defines customInstallerDirectoryFailed
; (message box with the error code and log path). Fallback keeps silent behaviour.
!macro dshReportDirectoryFailure
  ${If} $dshRestoreError != 0
    StrCpy $dshRecoveryStopped "1"
  ${EndIf}
  !ifmacrodef customInstallerDirectoryFailed
    !insertmacro customInstallerDirectoryFailed
  !else
    DetailPrint "Directory operation failed ($dshDirectoryError); restore error: $dshRestoreError"
  !endif
!macroend

!macro dshExtractPayload FILE
  nsExec::ExecToStack '"$PLUGINSDIR\dsh-7za.exe" x -y -bd -bb0 "-o$INSTDIR" "${FILE}"'
  Pop $R0
  Pop $R1
  ${If} $R0 != 0
    DetailPrint $R1
    !insertmacro dshLogDirectoryFailure "extract: 7za exit $R0 for ${FILE}: $R1"
    !ifmacrodef customInstallerExtractFailed
      !insertmacro customInstallerExtractFailed "${FILE}"
    !endif
    Call dshRollbackDirectories
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

!macro dshStageApplication
  StrCpy $dshFinalDirectory $INSTDIR
  System::Call 'ole32::CoCreateGuid(g .r0) i .r1'
  ${If} $1 != 0
    SetErrorLevel 2
    Quit
  ${EndIf}
  StrCpy $dshNewDirectory "$INSTDIR.new-$0"
  StrCpy $dshOldDirectory "$INSTDIR.old-$0"
  StrCpy $dshOldMoved ""
  StrCpy $dshNewMoved ""
  StrCpy $dshDirectoryError 0
  StrCpy $dshRestoreError 0
  StrCpy $dshRecoveryStopped ""
  ClearErrors
  CreateDirectory $dshNewDirectory
  ${If} ${Errors}
    SetErrorLevel 2
    Quit
  ${EndIf}
  File /oname=$PLUGINSDIR\dsh-7za.exe "${DSH_SEVENZIP_PATH}"
  StrCpy $INSTDIR $dshNewDirectory
  SetOutPath $INSTDIR
  !insertmacro installApplicationFiles
  File /oname=7zip-installer-LICENSE.txt "${DSH_SEVENZIP_LICENSE_DIR}\LICENSE.txt"
  File /oname=7zip-installer-COPYING.txt "${DSH_SEVENZIP_LICENSE_DIR}\COPYING"
  !ifdef UNINSTALLER_ICON
    File /oname=uninstallerIcon.ico "${UNINSTALLER_ICON}"
  !endif
  StrCpy $INSTDIR $dshFinalDirectory
  SetOutPath $PLUGINSDIR
!macroend

Function .onGUIEnd
  Call dshCleanupDirectories
FunctionEnd

Function dshCleanupDirectories
  ${If} $dshFinalDirectory != ""
    Call dshRollbackDirectories
  ${EndIf}
FunctionEnd

; Rollback touches only this installer's unique staging and backup paths.
; Recursive removals stay RMDir /r (best-effort cleanup); renames go through
; dshDirectoryOperation so their Windows error is captured and retried.
Function dshRollbackDirectories
  SetOutPath $PLUGINSDIR
  ${If} $dshNewMoved == "1"
    RMDir /r "\\?\$dshFinalDirectory"
    StrCpy $dshNewMoved ""
  ${EndIf}
  ${If} $dshOldMoved == "1"
    !insertmacro dshDirectoryOperation '$dshOldDirectory' '$dshFinalDirectory' $dshRestoreError "rollback-restore-old"
    ${If} $dshRestoreError != 0
      DetailPrint "Old application retained at $dshOldDirectory"
      Return
    ${EndIf}
    StrCpy $dshOldMoved ""
  ${EndIf}
  ${If} $dshNewDirectory != ""
    RMDir /r "\\?\$dshNewDirectory"
  ${EndIf}
  StrCpy $INSTDIR $dshFinalDirectory
FunctionEnd

Function dshPromoteDirectories
  ; SetOutPath keeps a directory handle open. Release it before either rename.
  SetOutPath $PLUGINSDIR
  ${If} ${FileExists} "$dshFinalDirectory\*.*"
    !insertmacro dshDirectoryOperation '$dshFinalDirectory' '$dshOldDirectory' $dshDirectoryError "promote-move-old"
    ${If} $dshDirectoryError != 0
      !insertmacro dshLogDirectoryFailure "promote: move final->old failed, Windows error $dshDirectoryError"
      Call dshRollbackDirectories
      !insertmacro dshReportDirectoryFailure
      SetErrors
      Return
    ${EndIf}
    StrCpy $dshOldMoved "1"
  ${Else}
    RMDir $dshFinalDirectory
  ${EndIf}
  !insertmacro dshDirectoryOperation '$dshNewDirectory' '$dshFinalDirectory' $dshDirectoryError "promote-move-new"
  ${If} $dshDirectoryError != 0
    !insertmacro dshLogDirectoryFailure "promote: move new->final failed, Windows error $dshDirectoryError"
    Call dshRollbackDirectories
    !insertmacro dshReportDirectoryFailure
    SetErrors
    Return
  ${EndIf}
  StrCpy $dshNewMoved "1"
  SetOutPath $dshFinalDirectory
  ClearErrors
FunctionEnd

!macro dshFinishDirectories
  StrCpy $dshNewMoved ""
  ${If} $dshOldMoved == "1"
    RMDir /r "\\?\$dshOldDirectory"
    StrCpy $dshOldMoved ""
  ${EndIf}
!macroend
