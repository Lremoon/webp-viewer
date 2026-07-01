; NSIS 安装器 hook：可选桌面快捷方式 + 右键菜单注册

; 注册/卸载某扩展名的右键菜单项（HKCU 顶层菜单）
!macro REGISTER_CONTEXTMENU EXT
  WriteRegStr HKCU "Software\Classes\.${EXT}\shell\WebpViewer" "" "使用 WebP Viewer 打开"
  WriteRegStr HKCU "Software\Classes\.${EXT}\shell\WebpViewer" "Icon" "$INSTDIR\${MAINBINARYNAME}.exe"
  WriteRegStr HKCU "Software\Classes\.${EXT}\shell\WebpViewer\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
!macroend
!macro UNREGISTER_CONTEXTMENU EXT
  DeleteRegKey HKCU "Software\Classes\.${EXT}\shell\WebpViewer"
!macroend

; 通知资源管理器刷新（右键菜单立即生效，无需重开窗口）
!macro NOTIFY_ASSOCCHANGED
  system::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

; 安装完成后：询问桌面快捷方式 + 注册右键菜单
!macro NSIS_HOOK_POSTINSTALL
  MessageBox MB_YESNO "是否在桌面创建快捷方式？" IDNO skipDesktop
  CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  DetailPrint "已创建桌面快捷方式"
  skipDesktop:

  !insertmacro REGISTER_CONTEXTMENU webp
  !insertmacro REGISTER_CONTEXTMENU jpg
  !insertmacro REGISTER_CONTEXTMENU jpeg
  !insertmacro REGISTER_CONTEXTMENU png
  !insertmacro REGISTER_CONTEXTMENU gif
  !insertmacro NOTIFY_ASSOCCHANGED
  DetailPrint "已注册右键菜单"
!macroend

; 卸载前：清理桌面快捷方式 + 移除右键菜单
!macro NSIS_HOOK_PREUNINSTALL
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"

  !insertmacro UNREGISTER_CONTEXTMENU webp
  !insertmacro UNREGISTER_CONTEXTMENU jpg
  !insertmacro UNREGISTER_CONTEXTMENU jpeg
  !insertmacro UNREGISTER_CONTEXTMENU png
  !insertmacro UNREGISTER_CONTEXTMENU gif
  !insertmacro NOTIFY_ASSOCCHANGED
!macroend
