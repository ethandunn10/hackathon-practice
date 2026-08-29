const { getSupabaseConfig } = require('../lib/handlers');

module.exports = (req, res) => {
  res.status(200).json(getSupabaseConfig());
};
