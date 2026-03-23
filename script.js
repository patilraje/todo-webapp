let tasks = JSON.parse(localStorage.getItem("tasks")) || []

function renderTasks() {

    let list = document.getElementById("taskList")
    list.innerHTML = ""

    tasks.forEach((task, index) => {

        let li = document.createElement("li")

        // ✅ Checkbox
        let checkbox = document.createElement("input")
        checkbox.type = "checkbox"
        checkbox.checked = task.completed

        checkbox.onchange = function(){
            tasks[index].completed = checkbox.checked
            saveTasks()
            renderTasks()
        }

        // ✅ Task text
        let span = document.createElement("span")
        span.textContent = task.text
        span.style.flex = "1"
        span.style.cursor = "pointer"
        span.style.userSelect = "none"

        if(task.completed){
            span.classList.add("completed")
        }

        // ✅ DOUBLE CLICK TO EDIT (WORKING)
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

        // ✅ Delete button
        let deleteBtn = document.createElement("button")
        deleteBtn.textContent = "🗑️"

        deleteBtn.onclick = function(){
            tasks.splice(index, 1)
            saveTasks()
            renderTasks()
        }

        li.appendChild(checkbox)
        li.appendChild(span)
        li.appendChild(deleteBtn)

        list.appendChild(li)
    })

    // ✅ Task counter
    let remaining = tasks.filter(task => !task.completed).length

    document.getElementById("taskCount").textContent =
        remaining === 1 ? "1 task remaining" : remaining + " tasks remaining"
}

// ✅ Add task
function addTask(){

    let input = document.getElementById("taskInput")
    let text = input.value.trim()

    if(text === "") return

    tasks.push({
        text: text,
        completed: false
    })

    saveTasks()
    renderTasks()

    input.value = ""
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

function toggleDarkMode(){
    document.body.classList.toggle("dark-mode")

    if(document.body.classList.contains("dark-mode")){
        localStorage.setItem("darkMode", "enabled")
    } else {
        localStorage.setItem("darkMode", "disabled")
    }
}

// ✅ Initial render
renderTasks()

// Load dark mode preference
if(localStorage.getItem("darkMode") === "enabled"){
    document.body.classList.add("dark-mode")
}