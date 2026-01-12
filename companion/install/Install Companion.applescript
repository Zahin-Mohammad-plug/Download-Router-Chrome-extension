-- AppleScript to install Download Router Companion
-- This provides a GUI-friendly way to install the native messaging host

on run
    try
        -- Get the app bundle path
        set appPath to POSIX path of (path to me)
        set appBundle to appPath & "../../"
        
        -- Check if running from installed app or DMG
        if appPath contains "/Applications/" then
            set scriptPath to appBundle & "Contents/Resources/app/install/install-macos.sh"
        else
            -- Running from DMG or development
            set scriptPath to appBundle & "install/install-macos.sh"
        end if
        
        -- Run installer script in Terminal
        tell application "Terminal"
            activate
            do script "bash \"" & scriptPath & "\""
        end tell
        
    on error errMsg
        display dialog "Error: " & errMsg buttons {"OK"} default button "OK" with icon stop
    end try
end run
