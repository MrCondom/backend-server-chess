function normalize(name) {
    if (!name) return "";
    return name.toString().trim().toLowerCase();
}

module.exports = {
    normalize,
};