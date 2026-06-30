; NSIS 安装器 hook：可选桌面快捷方式

; 安装完成后：询问是否在桌面创建快捷方式
!macro NSIS_HOOK_POSTINSTALL
  MessageBox MB_YESNO "是否在桌面创建快捷方式？" IDNO skipDesktop
  CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  DetailPrint "已创建桌面快捷方式"
  skipDesktop:
!macroend

; 卸载前：清理桌面快捷方式（若存在）
!macro NSIS_HOOK_PREUNINSTALL
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
!macroend
