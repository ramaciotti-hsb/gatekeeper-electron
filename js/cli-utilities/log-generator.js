const fs = require('fs');


const logValues = []

current = 0.0001

setInterval(() => {
    logValues.push({
        value: current,
        logValue: Math.log10(current)
    })
    if (current > 100000) {
        process.exit()
    } else if (current > 1000) {
        current += 1
    } else if (current > 100) {
        current += 0.1
    } else if (current > 10) {
        current += 0.001
    } else if (current > 1) {
        current += 0.0001
    } else if (current > 0) {
        current += 0.0001
    }
}, 0)


setInterval(() => {
    // write to a new file named 2pac.txt
    fs.writeFile('logTable.txt', JSON.stringify(logValues), (err) => {  
        // throws an error, you could also catch it here
        if (err) throw err;

        // success case, the file was saved
        console.log('Lyric saved!');
    });
}, 10000)