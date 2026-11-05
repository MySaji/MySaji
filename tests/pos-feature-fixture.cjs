const { loadService } = require("./load-service.cjs")
const traits = loadService("backend/domain/pos-traits.ts")
const profiles = loadService("backend/domain/pos-profiles.ts", { "./pos-traits": traits })
const features = loadService("backend/domain/pos-business-features.ts", { "./pos-profiles": profiles })
module.exports = { traits, profiles, features }
