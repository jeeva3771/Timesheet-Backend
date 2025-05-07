const formatDateLocal = (dateString) => {
    if (!dateString) return ''
    
    try {
      const date = new Date(dateString);
      
      if (isNaN(date.getTime())) return dateString;
      
      const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
      ]
      
      // Get day, month, and year with leading zeros for day
      const day = date.getDate().toString().padStart(2, '0') // Add leading zero if needed
      const month = months[date.getMonth()]
      const year = date.getFullYear()
      
      // Format as DD-MMM-YYYY
      return `${day}-${month}-${year}`
    } catch (error) {
      console.error('Error formatting date:', error)
      return dateString // Return original string if there's an error
    }
}

function capitalizeWords(str) {
    if (!str || typeof str !== 'string') return ''
    return str.replace(/\b\w/g, char => char.toUpperCase())
}

module.exports = {
    formatDateLocal,
    capitalizeWords
}