// Search filter para sa Student Handbook rules
function filterRules() {
    const input = document.getElementById('searchInput').value.toLowerCase().trim();
    const items = document.querySelectorAll('.rule-list li');
    const blocks = document.querySelectorAll('.category-block');
    const noResult = document.getElementById('noResult');
    let totalMatch = 0;

    items.forEach(item => {
        const text = item.textContent || item.innerText;

        if (input !== "" && text.toLowerCase().includes(input)) {
            item.style.display = "block";
            const regex = new RegExp(`(${input})`, 'gi');
            item.innerHTML = text.replace(regex, '<mark>$1</mark>');
            totalMatch++;
        } else if (input === "") {
            item.style.display = "block";
            item.innerHTML = text;
        } else {
            item.style.display = "none";
        }
    });

    // Itago ang mga kategoryang walang nag-match
    blocks.forEach(block => {
        const visibleItems = block.querySelectorAll('li[style*="display: block"]');
        if (input !== "" && visibleItems.length === 0) {
            block.style.display = "none";
        } else {
            block.style.display = "block";
        }
    });

    if (input !== "" && totalMatch === 0) {
        noResult.style.display = "block";
    } else {
        noResult.style.display = "none";
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keyup', filterRules);
    }
});
