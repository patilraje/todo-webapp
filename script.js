let tasks = JSON.parse(localStorage.getItem("tasks")) || []
let currentFilter = "all"

function todayLocalISO() {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
}

function renderTasks() {

    let list = document.getElementById("taskList")
    list.innerHTML = ""

    if(tasks.length === 0){
    let emptyMsg = document.createElement("p")
    emptyMsg.textContent = "No tasks yet 🚀"
    emptyMsg.style.opacity = "0.6"

    list.appendChild(emptyMsg)
    return
    }
    
    tasks.forEach((task, index) => {

    if(currentFilter === "active" && task.completed) return
    if(currentFilter === "completed" && !task.completed) return

    let li = document.createElement("li")

    // Checkbox
    let checkbox = document.createElement("input")
    checkbox.type = "checkbox"
    checkbox.checked = task.completed

    checkbox.onchange = function(){
        tasks[index].completed = checkbox.checked
        saveTasks()
        renderTasks()
    }

    // Task text
    let span = document.createElement("span")
    span.textContent = task.text
    span.style.flex = "1"
    span.style.cursor = "pointer"
    span.style.userSelect = "none"

    if(task.completed){
        span.classList.add("completed")
    }

    if (task.dueDate && !task.completed) {
        const today = todayLocalISO()
        if (task.dueDate < today) {
            span.classList.add("overdue")
        } else if (task.dueDate === today) {
            span.classList.add("due-today")
        }
    }

    // Due date
    let dateSpan = document.createElement("small")
    if(task.dueDate){
        dateSpan.textContent = " (" + task.dueDate + ")"
        dateSpan.style.marginLeft = "10px"
    }

    // Edit feature
    span.addEventListener("dblclick", function(e){
        e.preventDefault()

        let input = document.createElement("input")
        input.type = "text"
        input.value = task.text

        span.replaceWith(input)
        input.focus()

        function saveEdit(){
            let newText = input.value.trim()
            tasks[index].text = newText || task.text
            saveTasks()
            renderTasks()
        }

        input.addEventListener("keydown", function(event){
            if(event.key === "Enter"){
                saveEdit()
            }
        })

        input.addEventListener("blur", saveEdit)
    })

    // Delete button
    let deleteBtn = document.createElement("button")
    deleteBtn.textContent = "🗑️"

    deleteBtn.onclick = function(){
        tasks.splice(index, 1)
        saveTasks()
        renderTasks()
    }

    // ✅ CORRECT ORDER (ONLY ONCE)
    li.appendChild(checkbox)
    li.appendChild(span)
    li.appendChild(dateSpan)
    li.appendChild(deleteBtn)

    list.appendChild(li)
})

    // ✅ Task counter
    let total = tasks.length
    let completed = tasks.filter(task => task.completed).length
    let remaining = total - completed

    document.getElementById("taskCount").textContent =
        `${remaining} remaining | ${total} total | ${completed} completed`
}


// ✅ Add task
function addTask(){

    let input = document.getElementById("taskInput")
    let dateInput = document.getElementById("dueDate")

    let text = input.value.trim()

    // ✅ SAFE FIX
    let dueDate = ""
    if(dateInput){
        dueDate = dateInput.value
    }

    if(text === "") return

    tasks.push({
        text: text,
        completed: false,
        dueDate: dueDate
    })

    saveTasks()
    renderTasks()

    input.value = ""
    if(dateInput) dateInput.value = ""
}

// ✅ Enter key support
document.addEventListener("DOMContentLoaded", function() {
    document.getElementById("taskInput").addEventListener("keydown", function(event){
        if(event.key === "Enter"){
            addTask()
        }
    })
})

// ✅ Save tasks
function saveTasks(){
    localStorage.setItem("tasks", JSON.stringify(tasks))
}

// ✅ Clear completed
function clearCompleted(){
    tasks = tasks.filter(task => !task.completed)
    saveTasks()
    renderTasks()
}


function markAllComplete(){
    tasks.forEach(task => {
        task.completed = true
    })

    saveTasks()
    renderTasks()
}

function clearAllTasks(){
    if(tasks.length === 0) return

    const confirmed = window.confirm("Clear all tasks?")
    if(!confirmed) return

    tasks = []
    saveTasks()
    renderTasks()
}



function toggleDarkMode() {
    document.body.classList.toggle("dark-mode")
    localStorage.setItem(
        "darkMode",
        document.body.classList.contains("dark-mode") ? "enabled" : "disabled"
    )
}


function setFilter(filter){
    currentFilter = filter

    // Remove active class from all buttons
    document.getElementById("filter-all").classList.remove("active-filter")
    document.getElementById("filter-active").classList.remove("active-filter")
    document.getElementById("filter-completed").classList.remove("active-filter")

    // Add active class to selected
    document.getElementById("filter-" + filter).classList.add("active-filter")

    renderTasks()
}


if (localStorage.getItem("darkMode") === "enabled") {
    document.body.classList.add("dark-mode")
}

renderTasks()

document.getElementById("filter-all").classList.add("active-filter")