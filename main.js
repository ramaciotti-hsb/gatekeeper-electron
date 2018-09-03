const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const url = require('url')
const isDev = require('electron-is-dev')


// Support drag and drop of files out from the workspace
ipcMain.on('ondragstart', (event, filePath) => {
  console.log(filePath)
  event.sender.startDrag({
    file: filePath,
    icon: filePath
  })
})

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

function createWindow () {
  // Create the browser window.
  win = new BrowserWindow({ show: false })

  // and load the index.html of the app.
  win.loadURL(url.format({
    pathname: path.join(__dirname, isDev ? 'index.dev.html' : 'index.production.html'),
    protocol: 'file:',
    slashes: true
  }))

  win.toggleDevTools()

  // Set the window to the maximum size the browser will allow
  win.maximize()

  win.show()

  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow()
  }
})

// SSL/TSL: this is the self signed certificate support
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    // On certificate error we disable default behaviour (stop loading the page)
    // and we then say "it is all fine - true" to the callback
    event.preventDefault();
    callback(true);
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.