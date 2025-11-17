const v = process.versions.node.split('.')[0]
const major = parseInt(v, 10)
if (Number.isNaN(major) || major < 20) {
  console.error(`Node ${process.versions.node} detected. Please use Node 20 or higher.`)
  process.exit(1)
}
