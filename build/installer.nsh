!ifndef BUILD_UNINSTALLER
  !ifndef ONE_CLICK
    !include "LogicLib.nsh"
    !include "nsDialogs.nsh"
    !include "${__FILEDIR__}\installer-directories.nsh"

    Var DshDirectoryPage
    Var DshDirectoryEdit
    Var DshDirectoryNormalizationActive

    ; MUI invokes this after the assisted installer's directory page is ready.
    ; Normalize a selected drive root immediately so the page does not reject it
    ; before electron-builder's later install-time sanitization can run.
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW DshDirectoryPageShow

    Function DshDirectoryPageShow
      FindWindow $DshDirectoryPage "#32770" "" $HWNDPARENT
      GetDlgItem $DshDirectoryEdit $DshDirectoryPage 1019
      ${NSD_OnChange} $DshDirectoryEdit DshDirectoryChanged
      Call DshNormalizeDriveRoot
    FunctionEnd

    Function DshDirectoryChanged
      Pop $0
      Call DshNormalizeDriveRoot
    FunctionEnd

    Function DshNormalizeDriveRoot
      ${If} $DshDirectoryNormalizationActive == "1"
        Return
      ${EndIf}

      ${NSD_GetText} $DshDirectoryEdit $0
      StrLen $1 $0

      ; Accept both forms produced by typing or the Windows folder picker:
      ; "D:" and "D:\". Any non-root directory is left untouched.
      ${If} $1 == 2
        StrCpy $2 $0 1 1
        ${If} $2 != ":"
          Return
        ${EndIf}
        StrCpy $3 "$0\${APP_FILENAME}"
      ${ElseIf} $1 == 3
        StrCpy $2 $0 1 1
        ${If} $2 != ":"
          Return
        ${EndIf}
        StrCpy $2 $0 1 2
        ${If} $2 != "\"
          Return
        ${EndIf}
        StrCpy $3 "$0${APP_FILENAME}"
      ${Else}
        Return
      ${EndIf}

      StrCpy $DshDirectoryNormalizationActive "1"
      StrCpy $INSTDIR $3
      ${NSD_SetText} $DshDirectoryEdit $3
      StrCpy $DshDirectoryNormalizationActive "0"
    FunctionEnd

    ; Auto-create the installation directory tree before install begins.
    ; This allows users to type any path (e.g. D:\dsh-desktop) directly
    ; without needing to pre-create parent folders first.
    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE DshEnsureInstDirExists

    Function DshEnsureInstDirExists
      CreateDirectory "$INSTDIR"
    FunctionEnd

    ; Accept any directory path the user types, even if it does not exist yet.
    ; Without this override NSIS rejects non-existent paths before the user
    ; can click Next.
    !macro preInit
    !macroend
    Function .onVerifyInstDir
      ; Always pass — we create the directory in DshEnsureInstDirExists.
    FunctionEnd

    !macro customInstall
      !insertmacro dshFinishDirectories
      ; CHECK_APP_RUNNING force-kills the previous process, so will-quit never
      ; clears the session marker. Same-version overwrite would otherwise look
      ; like an unclean-exit. Delete is a no-op when the file is absent.
      !if "${APP_ID}" == "io.godot.codely.dev"
        Delete "$APPDATA\godot-codely-dev\desktop-service\session.json"
      !else if "${APP_ID}" == "io.godot.codely"
        Delete "$APPDATA\godot-codely\desktop-service\session.json"
      !endif
    !macroend

    ; Directory transaction failure (see installer-directories.nsh): rollback has
    ; already restored the previous installation. Tell the user why the upgrade
    ; did not apply and where the evidence lives instead of exiting silently.
    !macro customInstallerDirectoryFailed
      IfSilent +2 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "升级未能完成：替换安装目录失败（Windows 错误 $dshDirectoryError，恢复错误 $dshRestoreError）。已保留原版本。详情日志：$TEMP\godot-codely-installer-directories.log" /SD IDOK
    !macroend

    !macro customInstallerExtractFailed FILE
      IfSilent +2 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "升级未能完成：解压缩安装内容失败（${FILE}）。已保留原版本。详情日志：$TEMP\godot-codely-installer-directories.log" /SD IDOK
    !macroend

    !macro customInstallerStageFailed PHASE
      IfSilent +2 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "安装无法继续：无法准备安装目录（错误码 $dshDirectoryError）。目标目录：$dshFinalDirectory。请选择有写权限的目录，或选择为所有用户安装并允许管理员授权。原安装未更改。详情日志：$TEMP\godot-codely-installer-directories.log" /SD IDOK
    !macroend
  !endif
!endif
